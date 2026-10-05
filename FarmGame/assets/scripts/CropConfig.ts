/**
 * 作物配置表
 * 所有数值都放这里，不要写死在逻辑里。
 * 想调平衡，改这个文件就行，不用动代码逻辑。
 */

export interface CropData {
    id: string;
    name: string;
    /** 成长时间（秒） */
    growSeconds: number;
    /** 种子成本 */
    seedCost: number;
    /** 收获卖价 */
    sellPrice: number;
    /** 幼苗颜色（还没画美术，先用颜色区分） */
    sproutColor: string;
    /** 成熟颜色 */
    ripeColor: string;
    /**
     * 可选：这种作物的生长形态（按进度从小到大排）。
     * name = 图放在 assets/resources/art/ 里的文件名（不带扩展名）
     * at   = 生长到多少进度（0~1）换成这张图
     *
     * 没写就继续用色块画 —— 所以可以一种一种慢慢换。
     */
    art?: { name: string; at: number }[];
}

export const CROPS: CropData[] = [
    // ---- 短周期：负责开局爽感，让玩家 5 分钟内能反复操作 ----
    // 注意：萝卜现在设成 5 秒是为了方便你测试，正式版应该改成 120（2 分钟）
    { id: 'radish',  name: '萝卜', growSeconds: 5,   seedCost: 5,   sellPrice: 12,   sproutColor: '#8FD18A', ripeColor: '#E8734F' },
    { id: 'cabbage', name: '白菜', growSeconds: 30,  seedCost: 20,  sellPrice: 55,   sproutColor: '#9FE08C', ripeColor: '#D6E86A' },

    // ---- 中周期：白天分散回访 ----
    { id: 'tomato',  name: '番茄', growSeconds: 60,  seedCost: 120,  sellPrice: 312,   sproutColor: '#9ADB8C', ripeColor: '#E0503F' },
    { id: 'potato',  name: '土豆', growSeconds: 120, seedCost: 100,  sellPrice: 550,   sproutColor: '#9BD98A', ripeColor: '#C8A165' },
    { id: 'berry',   name: '草莓', growSeconds: 180, seedCost: 150,  sellPrice: 920,   sproutColor: '#A3E08E', ripeColor: '#E8436A' },
    { id: 'corn',    name: '玉米', growSeconds: 240, seedCost: 300,  sellPrice: 1440,  sproutColor: '#A8E07A', ripeColor: '#F2C744',
      art: [
        { name: 'crop_corn_1', at: 0 },
        { name: 'crop_corn_2', at: 0.18 },
        { name: 'crop_corn_3', at: 0.40 },
        { name: 'crop_corn_4', at: 0.72 },
      ] },

    // ---- 长周期：睡前种、第二天收 ----
    { id: 'pumpkin', name: '南瓜', growSeconds: 480,  seedCost: 500,  sellPrice: 3360,  sproutColor: '#A6DE7E', ripeColor: '#F08A2E' },
    { id: 'pepper',  name: '辣椒', growSeconds: 600,  seedCost: 600,  sellPrice: 4500,  sproutColor: '#9BD98A', ripeColor: '#D93B2B' },
    { id: 'melon',   name: '西瓜', growSeconds: 900,  seedCost: 1000, sellPrice: 7750,  sproutColor: '#A8E07A', ripeColor: '#4FA83F' },
    { id: 'grape',   name: '葡萄', growSeconds: 1800, seedCost: 1800, sellPrice: 18000, sproutColor: '#9ADB8C', ripeColor: '#8E5FBE' },
];

export function findCrop(id: string): CropData | null {
    for (let i = 0; i < CROPS.length; i++) {
        if (CROPS[i].id === id) {
            return CROPS[i];
        }
    }
    return null;
}
