/**
 * 动物配置表
 *
 * 数值都是"先随便填的"，正式版要重调 —— 调这一个文件就行。
 * 注意：为了测试方便，时间都设得很短（鸡 15 秒），正式版看括号里的值。
 */

export interface AnimalData {
    id: string;
    name: string;
    /** 买一只多少钱 */
    buyPrice: number;
    /** 从幼崽长到成年要多少秒（这期间不能喂、不能收、不能卖） */
    growUpSeconds: number;
    /** 喂一次食多少钱 */
    feedPrice: number;
    /** 喂一次能产几个（也是"最多能攒几个"） */
    feedTimes: number;
    /** 每产一个要多久（秒）。括号里是正式版建议值 */
    growSeconds: number;
    /** 产物 id（进仓库用） */
    productId: string;
    /** 产物名字 */
    productName: string;
    /** 产物卖价 */
    productPrice: number;
    /** 卖掉换来的肉（进仓库的物品 id） */
    meatId: string;
    /** 肉的名字 */
    meatName: string;
    /** 肉的市场价 */
    meatPrice: number;
    /** 占位颜色：肉 */
    meatColor: string;
    /** 占位颜色：动物本身 */
    bodyColor: string;
    /** 占位颜色：产物 */
    productColor: string;
}

export const ANIMALS: AnimalData[] = [
    {
        id: 'chicken',
        name: '鸡',
        buyPrice: 200,
        growUpSeconds: 30,        // 正式版：3600（1 小时）
        feedPrice: 20,
        feedTimes: 3,
        growSeconds: 15,          // 正式版：900（15 分钟）
        productId: 'egg',
        productName: '鸡蛋',
        productPrice: 100,
        meatId: 'chicken_meat',
        meatName: '鸡肉',
        meatPrice: 300,
        meatColor: '#E8B98C',
        bodyColor: '#F6F3EA',
        productColor: '#F2DC9A',
    },
    {
        id: 'sheep',
        name: '羊',
        buyPrice: 600,
        growUpSeconds: 60,        // 正式版：14400（4 小时）
        feedPrice: 60,
        feedTimes: 2,
        growSeconds: 60,          // 正式版：3600（1 小时）
        productId: 'wool',
        productName: '羊毛',
        productPrice: 450,
        meatId: 'mutton',
        meatName: '羊肉',
        meatPrice: 900,
        meatColor: '#D98F8F',
        bodyColor: '#EDE7DA',
        productColor: '#D8CBB4',
    },
    {
        id: 'cow',
        name: '牛',
        buyPrice: 1500,
        growUpSeconds: 120,       // 正式版：28800（8 小时）
        feedPrice: 150,
        feedTimes: 1,
        growSeconds: 180,         // 正式版：10800（3 小时）
        productId: 'milk',
        productName: '牛奶',
        productPrice: 1600,
        meatId: 'beef',
        meatName: '牛肉',
        meatPrice: 2250,
        meatColor: '#C96A6A',
        bodyColor: '#C9A882',
        productColor: '#FFFFFF',
    },
];

export function findAnimal(id: string): AnimalData | null {
    for (let i = 0; i < ANIMALS.length; i++) {
        if (ANIMALS[i].id === id) {
            return ANIMALS[i];
        }
    }
    return null;
}

/**
 * 牧场分成三个围栏：鸡栏、羊栏、牛栏。
 * 每个围栏内部按"一排 3 个"来站位，最多 6 只（两排）。
 *
 * 【重要】栏位下标 = 围栏号 × 6 + 栏内序号。
 * 所以 0~5 是鸡栏、6~11 是羊栏、12~17 是牛栏。
 * 每个围栏"现在能养几只"由存档里的上限决定（开局 3，可以扩建到 6）。
 */
export interface PenFence {
    /** 这一栏养什么 */
    animalId: string;
    /** 扩建到 6 只要多少钱 */
    expandPrice: number;
}

export const PEN_FENCES: PenFence[] = [
    { animalId: 'chicken', expandPrice: 3000 },
    { animalId: 'sheep',   expandPrice: 10000 },
    { animalId: 'cow',     expandPrice: 50000 },
];

/** 一个围栏里最多能养几只（对应两排 × 每排 3 个） */
export const PEN_CAP_MAX = 6;
/** 开局每个围栏能养几只 */
export const PEN_CAP_START = 3;
/** 扩建一次加几只 */
export const PEN_CAP_STEP = 3;

/** 一共几个栏位（每个围栏都按最大算，实际能用的看上限） */
export const PEN_COUNT = PEN_FENCES.length * PEN_CAP_MAX;

/** 一个栏位下标属于哪个围栏 */
export function penFenceIndex(penIndex: number): number {
    return Math.floor(penIndex / PEN_CAP_MAX);
}

/** 一个栏位下标养的是哪种动物 */
export function penAnimalId(penIndex: number): string {
    const fence = PEN_FENCES[penFenceIndex(penIndex)];
    return fence ? fence.animalId : '';
}

/** 按肉的 id 反查是哪种动物（市场里卖肉的时候用） */
export function findAnimalByMeat(meatId: string): AnimalData | null {
    for (let i = 0; i < ANIMALS.length; i++) {
        if (ANIMALS[i].meatId === meatId) {
            return ANIMALS[i];
        }
    }
    return null;
}

/** 按产物 id 反查是哪只动物产的 */
export function findAnimalByProduct(productId: string): AnimalData | null {
    for (let i = 0; i < ANIMALS.length; i++) {
        if (ANIMALS[i].productId === productId) {
            return ANIMALS[i];
        }
    }
    return null;
}
