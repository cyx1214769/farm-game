import { _decorator, Component, Node, Label, Graphics, Color, UITransform, Layers, EventTouch } from 'cc';
import { findItem, allItemIds } from './Items';
import { clearChildren } from './NodeUtil';

const { ccclass } = _decorator;

const PANEL_W = 620;
const PANEL_H = 780;
const ROW_H = 100;

const COLOR_TEXT = new Color(255, 246, 228, 255);
const COLOR_GOLD = new Color(240, 200, 110, 255);
const COLOR_HINT = new Color(205, 190, 165, 255);

/**
 * 市场面板。
 * 它只负责"把仓库里的东西列出来、让玩家点卖出"，
 * 至于卖多少钱、仓库怎么变，全由 FarmGame 决定。
 */
@ccclass('MarketPanel')
export class MarketPanel extends Component {
    public onSellCrop: ((cropId: string) => void) | null = null;
    public onSellAll: (() => void) | null = null;
    public onClose: (() => void) | null = null;

    private rowRoot: Node = null!;
    private emptyLabel: Label = null!;

    // ================= 搭建 =================

    public build() {
        // 半透明遮罩：盖住全屏，顺便挡住后面的点击
        const mask = new Node('Mask');
        mask.parent = this.node;
        mask.layer = Layers.Enum.UI_2D;
        mask.addComponent(UITransform).setContentSize(2000, 3000);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 150);
        mg.rect(-1000, -1500, 2000, 3000);
        mg.fill();
        // 挂个空的点击监听，把点透过去的路堵死（不然会点到后面的地块）
        mask.on(Node.EventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; }, this);

        // 面板本体
        const panel = new Node('Panel');
        panel.parent = this.node;
        panel.layer = Layers.Enum.UI_2D;
        panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(78, 60, 42, 255);
        pg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 22);
        pg.fill();

        this.makeLabel(panel, '市 场', 0, PANEL_H / 2 - 62, PANEL_W, 70, 40, COLOR_TEXT);

        // 行的容器
        this.rowRoot = new Node('Rows');
        this.rowRoot.parent = panel;
        this.rowRoot.layer = Layers.Enum.UI_2D;
        this.rowRoot.addComponent(UITransform).setContentSize(PANEL_W - 40, PANEL_H - 260);
        this.rowRoot.setPosition(0, 10, 0);

        this.emptyLabel = this.makeLabel(panel, '仓库是空的，先去收点菜吧', 0, 10, PANEL_W - 60, 80, 28, COLOR_HINT);

        this.makeButton(panel, '全部卖出', -150, -PANEL_H / 2 + 72, 250, 78, new Color(226, 176, 74, 255), () => {
            if (this.onSellAll) {
                this.onSellAll();
            }
        });
        this.makeButton(panel, '关闭', 160, -PANEL_H / 2 + 72, 190, 78, new Color(120, 96, 70, 255), () => {
            if (this.onClose) {
                this.onClose();
            }
        });

        this.node.active = false;
    }

    // ================= 对外接口 =================

    public setVisible(visible: boolean) {
        this.node.active = visible;
    }

    /** 按仓库内容重建列表 */
    public refresh(inventory: Record<string, number>) {
        clearChildren(this.rowRoot);

        const areaH = this.rowRoot.getComponent(UITransform)!.contentSize.height;
        let index = 0;

        // 遍历"仓库里能放的所有东西" —— 包括种出来的和养出来的
        const ids = allItemIds();
        for (let i = 0; i < ids.length; i++) {
            const item = findItem(ids[i]);
            if (!item) {
                continue;
            }
            const count = inventory[item.id] || 0;
            if (count <= 0) {
                continue;
            }

            const y = areaH / 2 - ROW_H / 2 - index * ROW_H;

            const row = new Node(`Row_${item.id}`);
            row.parent = this.rowRoot;
            row.layer = Layers.Enum.UI_2D;
            row.addComponent(UITransform).setContentSize(PANEL_W - 60, ROW_H - 12);
            row.setPosition(0, y, 0);

            this.makeLabel(row, `${item.name} × ${count}`, -120, 0, 260, ROW_H - 12, 30, COLOR_TEXT);
            this.makeLabel(row, `${count * item.sellPrice} 金`, 60, 0, 140, ROW_H - 12, 28, COLOR_GOLD);

            const id = item.id;
            this.makeButton(row, '卖出', 210, 0, 130, 66, new Color(226, 176, 74, 255), () => {
                if (this.onSellCrop) {
                    this.onSellCrop(id);
                }
            });

            index++;
        }

        this.emptyLabel.node.active = index === 0;
    }

    // ================= 小工具 =================

    private makeLabel(parent: Node, text: string, x: number, y: number, w: number, h: number, size: number, color: Color): Label {
        const node = new Node('Label');
        node.parent = parent;
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(x, y, 0);

        const lb = node.addComponent(Label);
        lb.fontFamily = 'Microsoft YaHei';
        lb.fontSize = size;
        lb.lineHeight = size + 6;
        lb.color = color;
        lb.horizontalAlign = Label.HorizontalAlign.CENTER;
        lb.verticalAlign = Label.VerticalAlign.CENTER;
        lb.string = text;
        return lb;
    }

    private makeButton(parent: Node, text: string, x: number, y: number, w: number, h: number, bg: Color, onClick: () => void) {
        const node = new Node('Btn');
        node.parent = parent;
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(x, y, 0);

        const bgNode = new Node('Bg');
        bgNode.parent = node;
        bgNode.layer = Layers.Enum.UI_2D;
        const g = bgNode.addComponent(Graphics);
        g.fillColor = bg;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.fill();

        this.makeLabel(node, text, 0, 0, w, h, 28, COLOR_TEXT);

        node.on(Node.EventType.TOUCH_END, onClick, this);
    }
}
