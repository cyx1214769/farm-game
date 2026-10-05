import { _decorator, Component, Node, Label, Graphics, Color, UITransform, Layers } from 'cc';
import { CROPS, CropData } from './CropConfig';
import { InputGuard } from './InputGuard';

const { ccclass } = _decorator;

const PAGE_SIZE = 5;        // 一页放几个种子
const BTN_W = 108;
const BTN_H = 146;
const BTN_GAP = 8;
const ARROW_W = 50;
const ARROW_H = 76;

const COLOR_SELECTED = new Color(226, 176, 74, 255);   // 选中的：暖金色
const COLOR_NORMAL   = new Color(96, 74, 52, 255);     // 买得起：深木色
const COLOR_DISABLED = new Color(74, 68, 60, 255);     // 买不起：暗灰
const COLOR_ARROW    = new Color(112, 90, 66, 255);
const COLOR_TOGGLE   = new Color(80, 62, 44, 255);

const COLOR_TEXT     = new Color(255, 246, 228, 255);
const COLOR_TEXT_OFF = new Color(146, 138, 126, 255);

interface Slot { node: Node; bg: Graphics; label: Label; }

/**
 * 底部种子栏。
 *
 * 三件事：
 *   1. 分页（作物多了，一页放不下）
 *   2. 可以收起，收起后能看清后面的农场
 *   3. 买不起的变灰
 *
 * 它只负责"让玩家选一种作物"，不碰金币规则、不碰地块。
 */
@ccclass('SeedBar')
export class SeedBar extends Component {
    /** 玩家选了第几种作物（全局下标） */
    public onSelect: ((cropIndex: number) => void) | null = null;

    private barRoot: Node = null!;
    private slots: Slot[] = [];
    private pageLabel: Label = null!;
    private toggleButton: Node = null!;
    private toggleLabel: Label = null!;

    private panelY = 0;
    private page = 0;
    private selectedIndex = 0;
    private coins = 0;
    private collapsed = false;

    // ================= 搭建 =================

    public build(panelY: number) {
        this.panelY = panelY;

        this.barRoot = new Node('SeedBarRoot');
        this.barRoot.parent = this.node;
        this.barRoot.layer = Layers.Enum.UI_2D;
        this.barRoot.setPosition(0, panelY, 0);

        const totalW = ARROW_W * 2 + BTN_GAP * 2 + PAGE_SIZE * BTN_W + (PAGE_SIZE - 1) * BTN_GAP;
        const left = -totalW / 2;

        // 左右翻页箭头
        this.makeArrow(left + ARROW_W / 2, -1, () => this.turnPage(-1));
        this.makeArrow(left + totalW - ARROW_W / 2, 1, () => this.turnPage(1));

        // 5 个固定的槽位，换页时只改内容，不重建节点
        const btnStart = left + ARROW_W + BTN_GAP;
        for (let i = 0; i < PAGE_SIZE; i++) {
            const x = btnStart + i * (BTN_W + BTN_GAP) + BTN_W / 2;
            this.slots.push(this.makeSlot(x, i));
        }

        // 页码（放在按钮下面，不跟上面的收起按钮抢位置）
        this.pageLabel = this.makeText(this.barRoot, '', 0, -BTN_H / 2 - 26, 220, 40, 26, COLOR_TEXT_OFF);

        // 收起 / 展开按钮（独立于 barRoot，收起之后它还在）
        this.makeToggle();

        this.refresh();
    }

    // ================= 对外接口 =================

    public select(index: number) {
        if (InputGuard.blocked()) {
            return;
        }
        this.selectedIndex = index;

        // 选中的不在当前页，就自动翻到那一页
        const targetPage = Math.floor(index / PAGE_SIZE);
        if (targetPage !== this.page) {
            this.page = targetPage;
        }

        this.refresh();
        if (this.onSelect) {
            this.onSelect(index);
        }
    }

    /** 金币变了，重画"买得起 / 买不起" */
    public setCoins(coins: number) {
        this.coins = coins;
        this.refresh();
    }

    public getSelectedCrop(): CropData {
        return CROPS[this.selectedIndex];
    }

    // ================= 内部 =================

    private turnPage(delta: number) {
        if (InputGuard.blocked()) {
            return;
        }
        const pageCount = Math.max(1, Math.ceil(CROPS.length / PAGE_SIZE));
        this.page = (this.page + delta + pageCount) % pageCount;
        this.refresh();
    }

    private toggle() {
        if (InputGuard.blocked()) {
            return;
        }
        this.collapsed = !this.collapsed;

        this.barRoot.active = !this.collapsed;

        // 收起后按钮挪到原来种子栏的位置，展开时它待在栏的上方
        const y = this.collapsed ? this.panelY : this.panelY + BTN_H / 2 + 32;
        this.toggleButton.setPosition(0, y, 0);
        this.toggleLabel.string = this.collapsed ? '选择种子 ▴' : '收起 ▾';
    }

    private refresh() {
        const pageCount = Math.max(1, Math.ceil(CROPS.length / PAGE_SIZE));
        const start = this.page * PAGE_SIZE;

        for (let i = 0; i < PAGE_SIZE; i++) {
            const slot = this.slots[i];
            const idx = start + i;

            if (idx >= CROPS.length) {
                slot.node.active = false;
                continue;
            }
            slot.node.active = true;

            const crop = CROPS[idx];
            slot.label.string = `${crop.name}\n${crop.seedCost}金\n${this.formatTime(crop.growSeconds)}`;

            const affordable = this.coins >= crop.seedCost;
            const selected = idx === this.selectedIndex;

            slot.bg.clear();
            slot.bg.fillColor = !affordable
                ? COLOR_DISABLED
                : (selected ? COLOR_SELECTED : COLOR_NORMAL);
            slot.bg.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 14);
            slot.bg.fill();

            slot.label.color = affordable ? COLOR_TEXT : COLOR_TEXT_OFF;
        }

        this.pageLabel.string = `${this.page + 1} / ${pageCount}`;
    }

    private formatTime(seconds: number): string {
        if (seconds < 60) {
            return `${seconds}秒`;
        }
        if (seconds < 3600) {
            return `${Math.round(seconds / 60)}分`;
        }
        return `${Math.round(seconds / 3600)}时`;
    }

    // ================= 小工具 =================

    private makeText(parent: Node, text: string, x: number, y: number, w: number, h: number, size: number, color: Color): Label {
        const node = new Node('Text');
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

    private makeArrow(x: number, dir: number, onClick: () => void) {
        const node = new Node('Arrow');
        node.parent = this.barRoot;
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(ARROW_W, ARROW_H);
        node.setPosition(x, 0, 0);

        const g = node.addComponent(Graphics);
        g.fillColor = COLOR_ARROW;
        const half = ARROW_W / 2;

        // 一个三角形，指向左边或右边
        g.moveTo(dir * half, 0);
        g.lineTo(-dir * half, ARROW_H / 2);
        g.lineTo(-dir * half, -ARROW_H / 2);
        g.close();
        g.fill();

        node.on(Node.EventType.TOUCH_END, onClick, this);
    }

    private makeSlot(x: number, slotIndex: number): Slot {
        const node = new Node(`Seed_${slotIndex}`);
        node.parent = this.barRoot;
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
        node.setPosition(x, 0, 0);

        const bgNode = new Node('Bg');
        bgNode.parent = node;
        bgNode.layer = Layers.Enum.UI_2D;
        const bg = bgNode.addComponent(Graphics);

        const label = this.makeText(node, '', 0, 0, BTN_W - 4, BTN_H - 16, 22, COLOR_TEXT);

        node.on(Node.EventType.TOUCH_END, () => this.select(this.page * PAGE_SIZE + slotIndex), this);

        return { node: node, bg: bg, label: label };
    }

    private makeToggle() {
        const w = 156;
        const h = 52;

        const node = new Node('Toggle');
        node.parent = this.node;
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(w, h);

        const g = node.addComponent(Graphics);
        g.fillColor = COLOR_TOGGLE;
        g.roundRect(-w / 2, -h / 2, w, h, 14);
        g.fill();

        this.toggleLabel = this.makeText(node, '收起 ▾', 0, 0, w, h, 24, COLOR_TEXT);

        node.on(Node.EventType.TOUCH_END, () => this.toggle(), this);

        this.toggleButton = node;
        node.setPosition(0, this.panelY + BTN_H / 2 + 32, 0);
    }
}
