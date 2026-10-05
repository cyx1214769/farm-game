import { _decorator, Component, Node, Graphics, Color, Layers, UITransform, EventTouch } from 'cc';

const { ccclass } = _decorator;

// ---------------- 配色（以后换美术时，这个文件整个删掉） ----------------
const TRUNK      = new Color(138, 104, 72, 255);
const LEAF_DARK  = new Color(95, 156, 90, 255);
const LEAF_LIGHT = new Color(122, 186, 116, 255);

const WALL       = new Color(230, 213, 184, 255);
const ROOF       = new Color(196, 98, 78, 255);
const DOOR       = new Color(112, 80, 56, 255);

const STONE      = new Color(185, 178, 166, 255);
const STONE_DARK = new Color(146, 140, 130, 255);

const BARN_WALL  = new Color(226, 205, 167, 255);
const BARN_ROOF  = new Color(127, 163, 194, 255);

const PASTURE    = new Color(150, 199, 126, 255);
const FENCE      = new Color(198, 162, 118, 255);
const ANIMAL_LT  = new Color(246, 243, 234, 255);
const ANIMAL_DK  = new Color(170, 134, 98, 255);

const WATER      = new Color(124, 184, 220, 255);
const WATER_DARK = new Color(104, 166, 204, 255);

const BLADE      = new Color(245, 240, 228, 255);

const PATH       = new Color(196, 168, 124, 255);   // 土路
const FLOWER_A   = new Color(238, 168, 196, 255);
const FLOWER_B   = new Color(246, 220, 132, 255);
const SHOP_WALL  = new Color(214, 190, 158, 255);
const SHOP_ROOF  = new Color(150, 130, 108, 255);

// 地图变大了，建筑统一放大 —— 想整体调大调小改这一个数
const S = 1.3;

/** 会左右轻摆的东西（树冠） */
interface Swayer { node: Node; x0: number; y0: number; phase: number; amp: number; }
/** 会慢慢走动的东西（牧场里的动物） */
interface Walker { node: Node; x0: number; y0: number; phase: number; range: number; }

/**
 * 农场里的"风景"：道路、房子、树、水井、风车、牧场、水塘、加工坊。
 *
 * 坐标相对**地图中心**（地图 1600×1600，见 FarmGame 的 MAP_W / MAP_H）。
 * 现在全是色块占位，以后买了美术把每个 makeXxx 换成 Sprite 就行。
 */
@ccclass('Scenery')
export class Scenery extends Component {
    /** 玩家点了牧场 */
    public onPastureClick: (() => void) | null = null;

    private blades: Node | null = null;
    private pondInner: Node | null = null;
    private pastureBadge: Node | null = null;
    private badgeBaseY = 0;
    private badgeTime = 0;

    private swayers: Swayer[] = [];
    private walkers: Walker[] = [];

    private time = 0;
    private treeCount = 0;

    // ================= 对外 =================

    public build() {
        // ---- 道路（最先画，铺在最下面）----
        this.makeRoads();

        // ---- 四角的大建筑 ----
        this.makeHouse(-560, 560);          // 左上：家
        this.makeWell(-320, 690);           // 水井，在家旁边
        this.makeWindmill(560, 540);        // 右上：风车
        this.makePasture(-540, -570);       // 左下：牧场
        this.makePond(530, -620);           // 右下：水塘
        this.makeWorkshop(650, -30);        // 右侧中部：加工坊

        // ---- 树 ----
        this.makeTree(0, 700, 1.05);
        this.makeTree(-150, 655, 0.9);
        this.makeTree(310, 675, 1.0);
        this.makeTree(-690, 300, 1.0);
        this.makeTree(690, 320, 0.95);
        this.makeTree(-700, -170, 1.0);
        this.makeTree(690, -200, 0.9);
        this.makeTree(-120, -730, 1.0);
        this.makeTree(240, -745, 0.9);

        // ---- 花圃 ----
        this.makeFlowers(-400, 390, 1.1);
        this.makeFlowers(390, 340, 1.0);
        this.makeFlowers(-320, -330, 0.95);
        this.makeFlowers(330, -300, 0.9);

        // ---- 农场左右边界的篱笆 ----
        this.makeFence(-740, 200, 9);
        this.makeFence(740, 200, 9);

        // ---- 地图上下变高了，边缘补几棵树 ----
        this.makeTree(0, 880, 0.95);
        this.makeTree(-310, 900, 0.85);
        this.makeTree(310, 870, 0.9);
        this.makeTree(-200, -880, 0.9);
        this.makeTree(160, -900, 0.85);
    }

    update(dt: number) {
        this.time += dt;
        const t = this.time;

        if (this.blades) {
            this.blades.angle -= dt * 42;
        }

        for (let i = 0; i < this.swayers.length; i++) {
            const s = this.swayers[i];
            s.node.setPosition(s.x0 + Math.sin(t * 0.9 + s.phase) * s.amp, s.y0, 0);
        }

        if (this.pondInner) {
            const k = 1 + Math.sin(t * 1.6) * 0.045;
            this.pondInner.setScale(k, k, 1);
        }

        for (let i = 0; i < this.walkers.length; i++) {
            const w = this.walkers[i];
            const dx = Math.sin(t * 0.4 + w.phase) * w.range;
            const bob = Math.abs(Math.sin(t * 2.6 + w.phase)) * 3;
            w.node.setPosition(w.x0 + dx, w.y0 + bob, 0);
        }

        // 牧场上面那个"有东西可收"的小图标，轻轻上下浮
        if (this.pastureBadge && this.pastureBadge.active) {
            this.badgeTime += dt;
            this.pastureBadge.setPosition(this.pastureBadge.position.x, this.badgeBaseY + Math.sin(this.badgeTime * 3) * 4, 0);
        }
    }

    /** 牧场里有没有东西可以收 —— 有的话在牧场上冒一个小图标 */
    public setPastureBadge(on: boolean) {
        if (!this.pastureBadge) {
            return;
        }
        this.pastureBadge.active = on;
        if (on) {
            this.badgeTime = 0;
            this.pastureBadge.setPosition(this.pastureBadge.position.x, this.badgeBaseY, 0);
        }
    }

    // ================= 绘制小工具 =================

    /** 一个容器节点，带缩放 —— 建筑用它，内部坐标就不用一个个乘了 */
    private group(name: string, x: number, y: number, s: number): Node {
        const node = new Node(name);
        node.parent = this.node;
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(x, y, 0);
        node.setScale(s, s, 1);
        return node;
    }

    /** 往指定容器里加一个图形节点（位置是容器内的局部坐标 0,0） */
    private shapeIn(parent: Node, name: string, draw: (g: Graphics) => void): Node {
        const node = new Node(name);
        node.parent = parent;
        node.layer = Layers.Enum.UI_2D;
        const g = node.addComponent(Graphics);
        draw(g);
        return node;
    }

    /** 直接挂到风景根节点上的图形（树、花、篱笆用） */
    private shape(name: string, x: number, y: number, draw: (g: Graphics) => void): Node {
        const node = new Node(name);
        node.parent = this.node;
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(x, y, 0);
        const g = node.addComponent(Graphics);
        draw(g);
        return node;
    }

    private fillRect(g: Graphics, x: number, y: number, w: number, h: number, fill: Color) {
        g.fillColor = fill;
        g.rect(x, y, w, h);
        g.fill();
    }

    private fillEllipse(g: Graphics, cx: number, cy: number, rx: number, ry: number, fill: Color) {
        g.fillColor = fill;
        g.ellipse(cx, cy, rx, ry);
        g.fill();
    }

    private fillPoly(g: Graphics, pts: number[][], fill: Color) {
        g.fillColor = fill;
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
            g.lineTo(pts[i][0], pts[i][1]);
        }
        g.close();
        g.fill();
    }

    // ================= 道路 =================

    /**
     * 绕田地一圈的环路 + 三条支路。
     * 路都是沿着等距网格方向铺的（2:1 斜率），和建筑透视一致。
     */
    private makeRoads() {
        const g0 = new Node('Roads');
        g0.parent = this.node;
        g0.layer = Layers.Enum.UI_2D;
        const g = g0.addComponent(Graphics);
        g.fillColor = PATH;

        const RW = 46;                       // 路宽
        const RING_W = 532, RING_H = 266;    // 环路：比田地大一圈的菱形
        const RING_LEN = 594.8;              // 一条边的长度

        this.roadInto(g, 0, RING_H, 1, -0.5, RING_LEN, RW);      // 右上边
        this.roadInto(g, RING_W, 0, -1, -0.5, RING_LEN, RW);     // 右下边
        this.roadInto(g, 0, -RING_H, -1, 0.5, RING_LEN, RW);     // 左下边
        this.roadInto(g, -RING_W, 0, 1, 0.5, RING_LEN, RW);      // 左上边

        this.roadInto(g, 0, RING_H, -1, 0.5, 626, RW);           // 支路：通往房子
        this.roadInto(g, RING_W, 0, 1, -0.5, 135, RW);           // 支路：通往加工坊
        this.roadInto(g, 0, -RING_H, -1, -0.5, 690, RW);         // 支路：通往牧场

        g.fill();
    }

    /** 往 Graphics 里加一条"路带"：从 (x,y) 沿 (dx,dy) 方向走 len，宽 w */
    private roadInto(g: Graphics, x: number, y: number, dx: number, dy: number, len: number, w: number) {
        const L = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / L, uy = dy / L;
        const nx = -uy * w / 2, ny = ux * w / 2;
        const bx = x + ux * len, by = y + uy * len;

        g.moveTo(x + nx, y + ny);
        g.lineTo(bx + nx, by + ny);
        g.lineTo(bx - nx, by - ny);
        g.lineTo(x - nx, y - ny);
        g.close();
    }

    // ================= 各种风景 =================

    /** 树：树干不动，两团树冠轻轻摆（s 同时控制大小和摆幅） */
    private makeTree(x: number, y: number, s: number) {
        this.shape('TreeTrunk', x, y, (g) => {
            this.fillRect(g, -7 * s, 0, 14 * s, 38 * s, TRUNK);
        });

        const phase = this.treeCount * 1.3;
        this.treeCount++;

        const crownA = this.shape('TreeCrownA', x, y, (g) => {
            this.fillEllipse(g, 0, 52 * s, 36 * s, 27 * s, LEAF_DARK);
        });
        const crownB = this.shape('TreeCrownB', x, y, (g) => {
            this.fillEllipse(g, -11 * s, 64 * s, 26 * s, 20 * s, LEAF_LIGHT);
        });

        this.swayers.push({ node: crownA, x0: x, y0: y, phase: phase, amp: 2.2 * s });
        this.swayers.push({ node: crownB, x0: x, y0: y, phase: phase + 0.5, amp: 2.8 * s });
    }

    /** 小屋：墙 + 屋顶 + 门 */
    private makeHouse(x: number, y: number) {
        const g0 = this.group('House', x, y, S);
        this.shapeIn(g0, 'Wall', (g) => this.fillRect(g, -72, 0, 144, 82, WALL));
        this.shapeIn(g0, 'Roof', (g) => this.fillPoly(g, [[-88, 82], [0, 152], [88, 82]], ROOF));
        this.shapeIn(g0, 'Door', (g) => this.fillRect(g, -20, 0, 40, 50, DOOR));
    }

    /** 加工坊：比房子小一点，带烟囱 */
    private makeWorkshop(x: number, y: number) {
        const g0 = this.group('Workshop', x, y, S);
        this.shapeIn(g0, 'Wall', (g) => this.fillRect(g, -56, 0, 112, 70, SHOP_WALL));
        this.shapeIn(g0, 'Roof', (g) => this.fillPoly(g, [[-70, 70], [0, 126], [70, 70]], SHOP_ROOF));
        this.shapeIn(g0, 'Chimney', (g) => this.fillRect(g, 26, 108, 20, 40, STONE_DARK));
        this.shapeIn(g0, 'Door', (g) => this.fillRect(g, -16, 0, 32, 42, DOOR));
    }

    /** 水井：石身 + 井口 */
    private makeWell(x: number, y: number) {
        const g0 = this.group('Well', x, y, S);
        this.shapeIn(g0, 'Body', (g) => this.fillRect(g, -34, 0, 68, 48, STONE));
        this.shapeIn(g0, 'Top', (g) => this.fillEllipse(g, 0, 48, 38, 15, STONE_DARK));
    }

    /** 风车：塔身 + 顶 + 会转的叶片 */
    private makeWindmill(x: number, y: number) {
        const g0 = this.group('Windmill', x, y, S);
        this.shapeIn(g0, 'Tower', (g) => this.fillPoly(g, [[-32, 0], [32, 0], [19, 122], [-19, 122]], WALL));
        this.shapeIn(g0, 'Roof', (g) => this.fillPoly(g, [[-26, 122], [26, 122], [0, 154]], ROOF));

        // 叶片单独一个节点（放在 group 里，所以会跟着一起缩放）
        const blades = new Node('Blades');
        blades.parent = g0;
        blades.layer = Layers.Enum.UI_2D;
        blades.setPosition(0, 132, 0);
        const bg = blades.addComponent(Graphics);

        bg.fillColor = BLADE;
        bg.moveTo(0, -6); bg.lineTo(54, -13); bg.lineTo(54, 13); bg.lineTo(0, 6); bg.close();
        bg.moveTo(6, 0); bg.lineTo(13, 54); bg.lineTo(-13, 54); bg.lineTo(-6, 0); bg.close();
        bg.moveTo(0, 6); bg.lineTo(-54, 13); bg.lineTo(-54, -13); bg.lineTo(0, -6); bg.close();
        bg.moveTo(-6, 0); bg.lineTo(-13, -54); bg.lineTo(13, -54); bg.lineTo(6, 0); bg.close();
        bg.fill();

        this.blades = blades;
    }

    /** 一簇花：几个小圆点 */
    private makeFlowers(x: number, y: number, s: number) {
        this.shape('FlowersA', x, y, (g) => {
            g.fillColor = FLOWER_A;
            g.circle(-14 * s, 0, 8 * s);
            g.circle(0, 11 * s, 9 * s);
            g.circle(15 * s, -3 * s, 7 * s);
            g.fill();
        });
        this.shape('FlowersB', x, y, (g) => {
            g.fillColor = FLOWER_B;
            g.circle(-6 * s, 14 * s, 6 * s);
            g.circle(10 * s, 18 * s, 6.5 * s);
            g.fill();
        });
    }

    /** 一段篱笆：竖着排 count 根柱子 */
    private makeFence(x: number, y: number, count: number) {
        this.shape('Fence', x, y, (g) => {
            g.fillColor = FENCE;
            for (let i = 0; i < count; i++) {
                const py = -i * 78;
                g.moveTo(x - 7, py - 34); g.lineTo(x + 7, py - 34);
                g.lineTo(x + 7, py + 34); g.lineTo(x - 7, py + 34); g.close();
            }
            g.fill();
        });
    }

    /** 牧场：围起来的草地 + 小棚子 + 两只动物 */
    private makePasture(x: number, y: number) {
        const g0 = this.group('Pasture', x, y, S);

        this.shapeIn(g0, 'Grass', (g) => this.fillEllipse(g, 0, 0, 132, 54, PASTURE));

        this.shapeIn(g0, 'Fence', (g) => {
            g.fillColor = FENCE;
            g.moveTo(-128, 8); g.lineTo(128, 8); g.lineTo(128, 18); g.lineTo(-128, 18); g.close();
            g.moveTo(-126, -12); g.lineTo(-114, -12); g.lineTo(-114, 28); g.lineTo(-126, 28); g.close();
            g.moveTo(-16, -12); g.lineTo(-4, -12); g.lineTo(-4, 28); g.lineTo(-16, 28); g.close();
            g.moveTo(96, -12); g.lineTo(108, -12); g.lineTo(108, 28); g.lineTo(96, 28); g.close();
            g.fill();
        });

        this.shapeIn(g0, 'BarnWall', (g) => this.fillRect(g, -46, 34, 92, 46, BARN_WALL));
        this.shapeIn(g0, 'BarnRoof', (g) => this.fillPoly(g, [[-56, 80], [0, 122], [56, 80]], BARN_ROOF));

        const sheep = this.shapeIn(g0, 'AnimalA', (g) => this.fillEllipse(g, -62, 22, 21, 16, ANIMAL_LT));
        const cow = this.shapeIn(g0, 'AnimalB', (g) => this.fillEllipse(g, 52, 18, 24, 17, ANIMAL_DK));

        // 动物在 group 里走动，坐标是局部坐标，缩放自动生效
        this.walkers.push({ node: sheep, x0: 0, y0: 0, phase: 0, range: 50 });
        this.walkers.push({ node: cow, x0: 0, y0: 0, phase: 2.1, range: 42 });

        // ---- 触摸区域：盖住整片牧场，点它打开牧场面板 ----
        const hit = new Node('Hit');
        hit.parent = g0;
        hit.layer = Layers.Enum.UI_2D;
        hit.addComponent(UITransform).setContentSize(280, 140);
        hit.setPosition(0, 8, 0);
        hit.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            if (this.onPastureClick) {
                this.onPastureClick();
            }
        }, this);

        // ---- 状态图标：有东西可收时才显示 ----
        const badge = new Node('PastureBadge');
        badge.parent = this.node;      // 挂在根节点上，不跟着牧场缩放
        badge.layer = Layers.Enum.UI_2D;
        this.badgeBaseY = y + 195;
        badge.setPosition(x + 62, this.badgeBaseY, 0);

        const bg = badge.addComponent(Graphics);
        bg.fillColor = new Color(232, 92, 72, 255);
        bg.circle(0, 0, 22);
        bg.fill();
        bg.fillColor = new Color(255, 246, 228, 255);
        bg.rect(-4, -13, 8, 17);
        bg.rect(-4, 7, 8, 8);
        bg.fill();

        badge.active = false;
        this.pastureBadge = badge;
    }

    /** 水塘：两个椭圆做出层次（内圈会起伏） */
    private makePond(x: number, y: number) {
        const g0 = this.group('Pond', x, y, S);
        this.shapeIn(g0, 'Outer', (g) => this.fillEllipse(g, 0, 0, 96, 42, WATER_DARK));
        this.pondInner = this.shapeIn(g0, 'Inner', (g) => this.fillEllipse(g, 0, 4, 82, 33, WATER));
    }
}
