import struct, json, io, sys, numpy as np
from PIL import Image
SRC='/home/claude/afterburn/models/mech.glb'; G=float(sys.argv[1]) if len(sys.argv)>1 else .17; H=5.8
d=open(SRC,'rb').read(); n,_=struct.unpack('<II',d[12:20]); j=json.loads(d[20:20+n]); bin0=20+n+8
def acc(i):
    a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]; off=bin0+bv.get('byteOffset',0)+a.get('byteOffset',0)
    dt={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8}[a['componentType']]; k={'VEC4':4,'VEC3':3,'VEC2':2,'SCALAR':1,'MAT4':16}[a['type']]
    st=bv.get('byteStride',0); sz=np.dtype(dt).itemsize*k
    if st and st!=sz: raw=np.frombuffer(d,dtype=np.uint8,count=st*a['count'],offset=off).reshape(a['count'],st)[:,:sz].copy(); return raw.view(dt).reshape(a['count'],k)
    return np.frombuffer(d,dtype=dt,count=a['count']*k,offset=off).reshape(a['count'],k)
nodes=j['nodes']; par={}
for i,nd in enumerate(nodes):
    for c in nd.get('children',[]): par[c]=i
def local(nd):
    if 'matrix' in nd: return np.array(nd['matrix'],dtype=np.float64).reshape(4,4).T
    return np.eye(4)
W={}
def world(i):
    if i in W: return W[i]
    m=local(nodes[i]); W[i]=(world(par[i])@m) if i in par else m; return W[i]
name={i:nd.get('name','') for i,nd in enumerate(nodes)}
bone={name[i].replace('mixamorig:',''):world(i)[:3,3] for i in range(len(nodes)) if name[i].startswith('mixamorig:')}
mi=[i for i,nd in enumerate(nodes) if 'mesh' in nd][0]; prim=j['meshes'][nodes[mi]['mesh']]['primitives'][0]
P=acc(prim['attributes']['POSITION']).astype(np.float64); UV=acc(prim['attributes']['TEXCOORD_0']).astype(np.float64); JN=acc(prim['attributes']['JOINTS_0']); WT=acc(prim['attributes']['WEIGHTS_0']).astype(np.float64); I=acc(prim['indices']).reshape(-1,3)
Mw=world(mi); P=(P@Mw[:3,:3].T)+Mw[:3,3]
flip=np.array([-1,1,-1.])*H           # the model faces +z and is 1 tall; the walker faces -z and is 5.8 m
P=P*flip; bone={k:v*flip for k,v in bone.items()}
print('height',P[:,1].min(),P[:,1].max(),'x',P[:,0].min(),P[:,0].max(),'z',P[:,2].min(),P[:,2].max())
joints=j['skins'][0]['joints']; jname=[name[k].replace('mixamorig:','') for k in joints]
side=lambda nm: 'L' if bone[nm][0]<0 else 'R'      # the walker's left is -x
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
jp=[part_of(nm) for nm in jname]
dom=JN[np.arange(len(P)),WT.argmax(1)]; vpart=np.array([jp[k] for k in dom])
# frames
def rot_to_down(dv):
    a=dv/np.linalg.norm(dv); b=np.array([0,-1.,0]); v=np.cross(a,b); c=a@b
    if np.linalg.norm(v)<1e-9: return np.eye(3)
    vx=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]]); return np.eye(3)+vx+vx@vx/(1+c)
S={}
for s in ('Left','Right'):
    sd=side(s+'UpLeg'); S['thigh'+sd]=(bone[s+'UpLeg'],bone[s+'Leg']); S['shin'+sd]=(bone[s+'Leg'],bone[s+'Foot']); S['foot'+sd]=(bone[s+'Foot'],None)
    sd=side(s+'Arm'); S['up'+sd]=(bone[s+'Arm'],bone[s+'ForeArm']); S['fore'+sd]=(bone[s+'ForeArm'],bone[s+'Hand'])
hipJ=(bone['LeftUpLeg']+bone['RightUpLeg'])/2; hipJ[0]=0; TORSO_UP=.35
S['hips']=(hipJ,None); S['torso']=(hipJ+np.array([0,TORSO_UP,0]),None)
L=lambda a,b: float(np.linalg.norm(S[a][1]-S[a][0]))
dims=dict(L1=L('thighL',0),L2=L('shinL',0),ANK=float(bone['LeftFoot'][1]),HIP_X=float(abs(bone['LeftUpLeg'][0])),HIP_BIND=float(hipJ[1]),A1n=L('upL',0),A2n=L('foreL',0),SH_X=float(abs(bone['LeftArm'][0])),SH_Y=float(bone['LeftArm'][1]-hipJ[1]-TORSO_UP),SH_Z=float(bone['LeftArm'][2]-hipJ[2]),hipZ=float(hipJ[2]))
print(dims)
A1=A2=1.3
tex=None
for im in j['images']:
    bv=j['bufferViews'][im['bufferView']]; tex=np.asarray(Image.open(io.BytesIO(d[bin0+bv.get('byteOffset',0):bin0+bv.get('byteOffset',0)+bv['byteLength']])).convert('RGB')).astype(np.float64)
th,tw=tex.shape[:2]
# sample the surface
T=P[I]; e=np.maximum(np.linalg.norm(T[:,1]-T[:,0],axis=1),np.linalg.norm(T[:,2]-T[:,0],axis=1)); pts=[];cols=[];prt=[]
for ti in range(len(I)):
    k=int(max(1,np.ceil(e[ti]/(G*.45)))); a,b,c=T[ti]; ua,ub,uc=UV[I[ti]]; pp=vpart[I[ti][0]]
    for u in range(k+1):
        for v in range(k+1-u):
            w0=u/k; w1=v/k; w2=1-w0-w1; pts.append(a*w2+b*w0+c*w1); uvp=ua*w2+ub*w0+uc*w1; cols.append(tex[int(np.clip(uvp[1]%1*th,0,th-1)),int(np.clip(uvp[0]%1*tw,0,tw-1))]); prt.append(pp)
pts=np.array(pts); cols=np.array(cols); prt=np.array(prt); print('samples',len(pts))
vox={}
for pn,(o,ch) in S.items():
    m=prt==pn; q=pts[m]-o
    if ch is not None:
        R=rot_to_down(ch-o); q=q@R.T; ln=np.linalg.norm(ch-o)
        if pn.startswith('up'): q[:,1]*=A1/ln
        if pn.startswith('fore'): q[:,1]*=A2/ln
    key=np.round(q/G).astype(int); cc=cols[m]; dct={}
    for kk,c3 in zip(map(tuple,key),cc):
        s=dct.setdefault(kk,[np.zeros(3),0]); s[0]+=c3; s[1]+=1
    vox[pn]={kk:s[0]/s[1] for kk,s in dct.items()}
allc=np.array([c for v in vox.values() for c in v.values()]); print('voxels',len(allc))
# a small palette
K=6; rng=np.random.default_rng(3); cen=allc[rng.choice(len(allc),K,replace=False)]
for _ in range(25):
    lab=((allc[:,None]-cen[None])**2).sum(2).argmin(1)
    for k in range(K):
        if (lab==k).any(): cen[k]=allc[lab==k].mean(0)
order=np.argsort(cen.sum(1)); cen=cen[order]; print('palette',[('#%02x%02x%02x'%tuple(int(x) for x in c)) for c in cen], np.bincount(((allc[:,None]-cen[None])**2).sum(2).argmin(1),minlength=K))
out={}
for pn,v in vox.items():
    cells={kk:int(((c-cen)**2).sum(1).argmin()) for kk,c in v.items()}; runs=[]; seen=set()
    for (x,y,z) in sorted(cells):
        if (x,y,z) in seen: continue
        ci=cells[(x,y,z)]; n2=1
        while (x,y+n2,z) in cells and cells[(x,y+n2,z)]==ci and (x,y+n2,z) not in seen: seen.add((x,y+n2,z)); n2+=1
        runs.append([int(x),int(y),int(z),int(n2),int(ci)])
    out[pn]=runs
print({k:len(v) for k,v in out.items()}, 'runs', sum(len(v) for v in out.values()))
dims.update(A1=A1,A2=A2,TORSO_UP=TORSO_UP)
js='/* Made by blocks.py from models/mech.glb (Hayden\'s mech model): the model cut into its rigid pieces and rebuilt from coarse\n   blocks in its own colours. Each run is [x, y, z, length along y, colour], in blocks of g metres, in the piece\'s own frame. */\nexport const MECH_BLOCKS = '+json.dumps(dict(g=G,palette=['#%02x%02x%02x'%tuple(int(x) for x in c) for c in cen],dims={k:round(v,3) for k,v in dims.items()},parts=out),separators=(',',':'))+';\n'
open('/home/claude/afterburn/mf/mechblocks.js','w').write(js); print('bytes',len(js))
