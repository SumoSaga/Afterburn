import struct, json, io, sys, numpy as np
from PIL import Image
def rot_to_down(dv):
    a=dv/np.linalg.norm(dv); b=np.array([0,-1.,0]); v=np.cross(a,b); c=a@b
    if np.linalg.norm(v)<1e-9: return np.eye(3)
    vx=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]]); return np.eye(3)+vx+vx@vx/(1+c)
def load(SRC):
    d=open(SRC,'rb').read(); n,_=struct.unpack('<II',d[12:20]); j=json.loads(d[20:20+n]); bin0=20+n+8
    def acc(i):
        a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]; off=bin0+bv.get('byteOffset',0)+a.get('byteOffset',0)
        dt={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8}[a['componentType']]; k={'VEC4':4,'VEC3':3,'VEC2':2,'SCALAR':1,'MAT4':16}[a['type']]
        st=bv.get('byteStride',0); sz=np.dtype(dt).itemsize*k
        if st and st!=sz: raw=np.frombuffer(d,dtype=np.uint8,count=st*a['count'],offset=off).reshape(a['count'],st)[:,:sz].copy(); return raw.view(dt).reshape(a['count'],k)
        return np.frombuffer(d,dtype=dt,count=a['count']*k,offset=off).reshape(a['count'],k)
    tex=None
    for im in j['images']:
        bv=j['bufferViews'][im['bufferView']]; o=bin0+bv.get('byteOffset',0); tex=np.asarray(Image.open(io.BytesIO(d[o:o+bv['byteLength']])).convert('RGB')).astype(np.float64)
    return d,j,acc,tex
def sample_color(tex,uv): th,tw=tex.shape[:2]; return tex[np.clip((uv[:,1]%1*th).astype(int),0,th-1),np.clip((uv[:,0]%1*tw).astype(int),0,tw-1)]
def finish(pts,cols,prt,S,G,A,K=6):
    vox={}
    for pn,(o,ch) in S.items():
        m=prt==pn; q=pts[m]-o
        if ch is not None:
            R=rot_to_down(ch-o); q=q@R.T; ln=np.linalg.norm(ch-o)
            if pn.startswith('up') or pn.startswith('fore'): q[:,1]*=A/ln
        key=np.round(q/G).astype(int); cc=cols[m]; uq,inv=np.unique(key,axis=0,return_inverse=True); inv=inv.ravel(); sm=np.zeros((len(uq),3)); np.add.at(sm,inv,cc); cnt=np.bincount(inv,minlength=len(uq))[:,None]
        vox[pn]={tuple(int(x) for x in k):c for k,c in zip(uq,sm/cnt)}
    allc=np.array([c for v in vox.values() for c in v.values()]); rng=np.random.default_rng(3); cen=allc[rng.choice(len(allc),K,replace=False)]
    for _ in range(25):
        lab=((allc[:,None]-cen[None])**2).sum(2).argmin(1)
        for k in range(K):
            if (lab==k).any(): cen[k]=allc[lab==k].mean(0)
    cen=cen[np.argsort(cen.sum(1))]; out={}
    for pn,v in vox.items():
        cells={kk:int(((c-cen)**2).sum(1).argmin()) for kk,c in v.items()}; runs=[]; seen=set()
        for (x,y,z) in sorted(cells):
            if (x,y,z) in seen: continue
            ci=cells[(x,y,z)]; n2=1
            while (x,y+n2,z) in cells and cells[(x,y+n2,z)]==ci and (x,y+n2,z) not in seen: seen.add((x,y+n2,z)); n2+=1
            runs.append([int(x),int(y),int(z),int(n2),int(ci)])
        out[pn]=runs
    print('  voxels',len(allc),'runs',sum(len(v) for v in out.values()),'palette',['#%02x%02x%02x'%tuple(int(x) for x in c) for c in cen])
    share=np.bincount(np.array([ci for v in out.values() for r in v for ci in [r[4]]*r[3]]),minlength=K)/max(1,len(allc)); acc=K-1 if share[K-1]<.045 else -1; print('  share',np.round(share,3),'accent',acc)
    return out,['#%02x%02x%02x'%tuple(int(x) for x in c) for c in cen],acc
def dims_of(S,bone_arm_y,hipJ,A,TORSO_UP=.35):
    L=lambda a: float(np.linalg.norm(S[a][1]-S[a][0]))
    return dict(L1=L('thighL'),L2=L('shinL'),ANK=float(S['footL'][0][1]),HIP_X=float(abs(S['thighL'][0][0])),SH_X=float(abs(S['upL'][0][0])),SH_Y=float(S['upL'][0][1]-hipJ[1]-TORSO_UP),A1=A,A2=A,TORSO_UP=TORSO_UP)
def rigged(SRC,H,G,A):
    d,j,acc,tex=load(SRC); nodes=j['nodes']; par={}
    for i,nd in enumerate(nodes):
        for c in nd.get('children',[]): par[c]=i
    W={}
    def world(i):
        if i in W: return W[i]
        m=np.array(nodes[i]['matrix'],dtype=np.float64).reshape(4,4).T if 'matrix' in nodes[i] else np.eye(4); W[i]=(world(par[i])@m) if i in par else m; return W[i]
    name={i:nd.get('name','') for i,nd in enumerate(nodes)}; flip=np.array([-1,1,-1.])*H
    bone={name[i].replace('mixamorig:',''):world(i)[:3,3]*flip for i in range(len(nodes)) if name[i].startswith('mixamorig:')}
    mi=[i for i,nd in enumerate(nodes) if 'mesh' in nd][0]; prim=j['meshes'][nodes[mi]['mesh']]['primitives'][0]
    P=acc(prim['attributes']['POSITION']).astype(np.float64); UV=acc(prim['attributes']['TEXCOORD_0']).astype(np.float64); JN=acc(prim['attributes']['JOINTS_0']); WT=acc(prim['attributes']['WEIGHTS_0']).astype(np.float64); I=acc(prim['indices']).reshape(-1,3)
    Mw=world(mi); P=((P@Mw[:3,:3].T)+Mw[:3,3])*flip
    jname=[name[k].replace('mixamorig:','') for k in j['skins'][0]['joints']]; side=lambda nm: 'L' if bone[nm][0]<0 else 'R'
    def part_of(nm):
        for s in ('Left','Right'):
            if nm.startswith(s):
                sd=side(s+'UpLeg') if ('Leg' in nm or 'Foot' in nm or 'Toe' in nm) else side(s+'Arm'); r=nm[len(s):]
                if r=='UpLeg': return 'thigh'+sd
                if r=='Leg': return 'shin'+sd
                if r.startswith('Foot') or r.startswith('Toe'): return 'foot'+sd
                if r=='Shoulder': return 'torso'
                if r=='Arm': return 'up'+sd
                return 'fore'+sd
        return 'hips' if nm=='Hips' else 'torso'
    jp=[part_of(nm) for nm in jname]; vpart=np.array([jp[k] for k in JN[np.arange(len(P)),WT.argmax(1)]])
    S={}
    for s in ('Left','Right'):
        sd=side(s+'UpLeg'); S['thigh'+sd]=(bone[s+'UpLeg'],bone[s+'Leg']); S['shin'+sd]=(bone[s+'Leg'],bone[s+'Foot']); S['foot'+sd]=(bone[s+'Foot'],None)
        sd=side(s+'Arm'); S['up'+sd]=(bone[s+'Arm'],bone[s+'ForeArm']); S['fore'+sd]=(bone[s+'ForeArm'],bone[s+'Hand'])
    hipJ=(bone['LeftUpLeg']+bone['RightUpLeg'])/2; hipJ[0]=0; S['hips']=(hipJ,None); S['torso']=(hipJ+np.array([0,.35,0]),None)
    T=P[I]; e=np.maximum(np.linalg.norm(T[:,1]-T[:,0],axis=1),np.linalg.norm(T[:,2]-T[:,0],axis=1)); pts=[];uvs=[];prt=[]
    for ti in range(len(I)):
        k=int(max(1,np.ceil(e[ti]/(G*.45)))); a,b,c=T[ti]; ua,ub,uc=UV[I[ti]]; pp=vpart[I[ti][0]]
        for u in range(k+1):
            for v in range(k+1-u):
                w0=u/k; w1=v/k; w2=1-w0-w1; pts.append(a*w2+b*w0+c*w1); uvs.append(ua*w2+ub*w0+uc*w1); prt.append(pp)
    pts=np.array(pts); cols=sample_color(tex,np.array(uvs)); out,pal,ac=finish(pts,cols,np.array(prt),S,G,A)
    return dict(g=G,palette=pal,accent=ac,dims={k:round(v,3) for k,v in dims_of(S,0,hipJ,A).items()},parts=out)
def unrigged(SRC,H,G,A,J):
    # no skeleton in the file: the joints are given by hand (in the model's own units, x to its left) and each bit of surface goes to the nearest limb
    d,j,acc,tex=load(SRC); prim=j['meshes'][0]['primitives'][0]; P=acc(prim['attributes']['POSITION']).astype(np.float64); UV=acc(prim['attributes']['TEXCOORD_0']).astype(np.float64)
    flip=np.array([-1,1,-1.])*H; pts=P*flip; cols=sample_color(tex,UV); V=lambda x,y,z: np.array([x,y,z])*flip
    S={}; segs=[]
    for sd,sx in (('L',1),('R',-1)):   # model +x becomes the walker's -x, its left
        hip=V(sx*J['hip'][0],J['hip'][1],J['hip'][2]); knee=V(sx*J['knee'][0],J['knee'][1],J['knee'][2]); ank=V(sx*J['ankle'][0],J['ankle'][1],J['ankle'][2]); toe=V(sx*J['toe'][0],J['toe'][1],J['toe'][2])
        sh=V(sx*J['shoulder'][0],J['shoulder'][1],J['shoulder'][2]); el=V(sx*J['elbow'][0],J['elbow'][1],J['elbow'][2]); hand=V(sx*J['hand'][0],J['hand'][1],J['hand'][2])
        S['thigh'+sd]=(hip,knee); S['shin'+sd]=(knee,ank); S['foot'+sd]=(ank,None); S['up'+sd]=(sh,el); S['fore'+sd]=(el,hand)
        segs+= [('thigh'+sd,hip,knee,J['r'][0]),('shin'+sd,knee,ank,J['r'][1]),('foot'+sd,ank,toe,J['r'][2]),('up'+sd,sh,el,J['r'][3]),('fore'+sd,el,hand+(hand-el)*.35,J['r'][3])]
    hipJ=V(0,J['hip'][1],J['hip'][2]); S['hips']=(hipJ,None); S['torso']=(hipJ+np.array([0,.35,0]),None)
    segs+=[('hips',V(-J['hip'][0],J['hip'][1],0),V(J['hip'][0],J['hip'][1],0),J['r'][4]),('torso',V(0,J['chest'][0],0),V(0,J['chest'][1],0),J['r'][5])]
    best=np.full(len(pts),1e9); lab=np.zeros(len(pts),dtype=int)
    for i,(nm,a,b,r) in enumerate(segs):
        ab=b-a; t=np.clip(((pts-a)@ab)/(ab@ab),0,1); dd=np.linalg.norm(pts-(a+t[:,None]*ab),axis=1)/(r*H); m=dd<best; best[m]=dd[m]; lab[m]=i
    prt=np.array([s[0] for s in segs])[lab]; out,pal,ac=finish(pts,cols,prt,S,G,A,K=4)
    return dict(g=G,palette=pal,accent=ac,dims={k:round(v,3) for k,v in dims_of(S,0,hipJ,A).items()},parts=out)
if __name__=='__main__':
    R='/home/claude/afterburn/models/'
    bodies={}
    print('medium'); bodies['medium']=rigged(R+'mech.glb',5.8,.17,1.3)
    print('heavy'); bodies['heavy']=rigged(R+'mech-b.glb',6.3,.19,1.4)
    print('light'); bodies['light']=unrigged('/home/claude/light-src.glb',5.0,.15,1.2,dict(hip=(.115,.5,.02),knee=(.135,.31,.085),ankle=(.175,.13,-.04),toe=(.2,.02,.06),shoulder=(.175,.8,0),elbow=(.26,.6,0),hand=(.25,.4,0),chest=(.6,.88),r=(.07,.06,.07,.05,.07,.17)))
    js="/* Made by tools/blocks.py from Hayden's mech models: each model cut into its rigid pieces and rebuilt from coarse blocks in\n   its own colours. One body per frame. Each run is [x, y, z, length along y, colour], in blocks of g metres, in the piece's own frame. */\nexport const MECH_BLOCKS = "+json.dumps(bodies,separators=(',',':'))+";\n"
    open('/home/claude/afterburn/mf/mechblocks.js','w').write(js); print('bytes',len(js)); print({k:v['dims'] for k,v in bodies.items()})
