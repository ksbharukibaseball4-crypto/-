import bpy, math, random, sys, time
from mathutils import Vector
argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
RES = float(argv[0]) if argv else 0.5; SAMPLES = int(argv[1]) if len(argv)>1 else 48; OUT = argv[2] if len(argv)>2 else 'b1.png'
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.render.resolution_x = 1080; sc.render.resolution_y = 1920; sc.render.resolution_percentage = int(RES*100)
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
random.seed(4)
def mat(name, base, rough=0.5, metal=0.0, extra=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if extra: extra(m, b)
    return m
# world: HDRI
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; nt = w.node_tree
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load('//hdri/apartment.exr'.replace('//', bpy.path.abspath('//') or './'))
bg = nt.nodes['Background']; bg.inputs['Strength'].default_value = 0.25; nt.links.new(env.outputs['Color'], bg.inputs['Color'])
# wood desk
def wood(m, b):
    n = m.node_tree.nodes; l = m.node_tree.links
    nz = n.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3; nz.inputs['Detail'].default_value = 12
    cr = n.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].color = (0.035, 0.037, 0.042, 1); cr.color_ramp.elements[1].color = (0.075, 0.078, 0.085, 1)
    l.new(nz.outputs['Fac'], cr.inputs['Fac']); l.new(cr.outputs['Color'], b.inputs['Base Color'])
    rr = n.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = 0.35; rr.inputs['To Max'].default_value = 0.6
    nz2 = n.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 25; l.new(nz2.outputs['Fac'], rr.inputs['Value']); l.new(rr.outputs['Result'], b.inputs['Roughness'])
bpy.ops.mesh.primitive_plane_add(size=40); desk = bpy.context.object; desk.data.materials.append(mat('wood', (0.2, 0.1, 0.05), extra=wood))
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 9, 0), rotation=(math.pi/2, 0, 0)); bpy.context.object.data.materials.append(mat('wall', (0.05, 0.055, 0.065), 0.9))
gold = mat('gold', (0.95, 0.72, 0.35), 0.22, 1.0); silver = mat('silver', (0.85, 0.85, 0.83), 0.25, 1.0)
red = mat('redcoin', (0.75, 0.08, 0.06), 0.3, 0.6)
def coin(x, y, z, m, rx=0, ry=0, r=0.265, h=0.035):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=r, depth=h, location=(x, y, z), rotation=(rx, ry, 0)); c = bpy.context.object
    bv = c.modifiers.new('b', 'BEVEL'); bv.width = 0.008; bv.segments = 3; bpy.ops.object.shade_smooth(); c.data.materials.append(m)
    bpy.ops.mesh.primitive_torus_add(major_radius=r*0.86, minor_radius=0.008, location=(x, y, z + h/2), rotation=(rx, ry, 0)); t = bpy.context.object; t.data.materials.append(m); t.parent = None
    return c
# salary stacks (center)
for sx, sy, n in [(-0.35, 0, 16), (-0.95, 0.35, 10), (0.25, 0.4, 7)]:
    for i in range(n):
        coin(sx + random.uniform(-0.012, 0.012), sy + random.uniform(-0.012, 0.012), 0.0175 + i * 0.036, gold, 0, 0)
# coins peeled off the top -> red, sliding toward the right (tax)
for k, (x, y, z, rx, ry) in enumerate([(-0.05, 0.25, 0.95, 0.5, -0.4), (0.35, 0.75, 1.25, 0.8, -0.7), (0.8, 1.25, 1.35, 1.1, -0.9)]):
    coin(x, y, z, red, rx, ry)
# payslip paper
pap = mat('paper', (0.92, 0.9, 0.86), 0.8)
bpy.ops.mesh.primitive_plane_add(size=1, location=(-0.75, -1.45, 0.002), rotation=(0, 0, 0.3)); p = bpy.context.object; p.scale = (0.85, 1.2, 1); p.data.materials.append(pap)
font = bpy.data.fonts.load('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf')
def text(s, loc, rotz, size, m):
    bpy.ops.object.text_add(location=loc, rotation=(0, 0, rotz)); t = bpy.context.object; t.data.body = s; t.data.font = font; t.data.size = size; t.data.align_x = 'CENTER'; t.data.materials.append(m); return t
ink = mat('ink', (0.05, 0.05, 0.06), 0.6); inkr = mat('inkr', (0.7, 0.08, 0.06), 0.6)
text('給与明細', (-0.85, -1.0, 0.004), 0.3, 0.14, ink)
for i, (a, m) in enumerate([('支給額', ink), ('所得税（天引き）', inkr), ('差引支給額', ink)]):
    text(a, (-0.75 + 0.07 * i, -1.25 - i * 0.22, 0.004), 0.3, 0.085, m)
# glass jar on the right (where tax goes)
glass = mat('glass', (0.95, 0.97, 1.0), 0.03, 0.0, lambda m, b: (b.inputs.__getitem__('Transmission Weight').__setattr__('default_value', 1.0), b.inputs['IOR'].__setattr__('default_value', 1.45)))
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.45, depth=1.0, location=(1.25, 1.9, 0.5)); jar = bpy.context.object
sol = jar.modifiers.new('s', 'SOLIDIFY'); sol.thickness = 0.03; bpy.ops.object.shade_smooth(); jar.data.materials.append(glass)
for i in range(9): coin(1.25 + random.uniform(-0.15, 0.15), 1.9 + random.uniform(-0.15, 0.15), 0.05 + i * 0.03, red, random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3))
# lights
bpy.ops.object.light_add(type='AREA', location=(-2.5, 2.0, 3.2)); k = bpy.context.object; k.data.energy = 420; k.data.size = 2.5; k.data.color = (1.0, 0.88, 0.72)
k.rotation_euler = (Vector((0, 0, 0.5)) - k.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.light_add(type='AREA', location=(3.0, 3.0, 1.6)); r2 = bpy.context.object; r2.data.energy = 160; r2.data.size = 1.5; r2.data.color = (0.75, 0.85, 1.0)
r2.rotation_euler = (Vector((0.5, 0, 0.5)) - r2.location).to_track_quat('-Z', 'Y').to_euler()
# camera: low, cinematic, shallow DOF
bpy.ops.object.camera_add(location=(0.2, -7.2, 2.7)); cam = bpy.context.object; sc.camera = cam
cam.data.lens = 50; cam.data.sensor_width = 36
tgt = Vector((0.25, 0.4, 0.95)); cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.dof.use_dof = True; cam.data.dof.focus_distance = (Vector((-0.2, 0.2, 0.7)) - cam.location).length; cam.data.dof.aperture_fstop = 2.8
sc.render.filepath = '//' + OUT
t0 = time.time(); bpy.ops.render.render(write_still=True); print('RENDER_SEC', round(time.time() - t0, 1))
