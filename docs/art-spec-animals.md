# 动物素材规格（第一批：鸡 / 羊 / 牛）

> 这批只做 **3 只动物 + 3 个产物图标**，做完牧场里就有活物了。
> 流程：**你出图 → 我先拼预览给你看 → 你点头 → 我才导进项目。**

---

## 0. 这批要做的东西

| 序 | 文件 | 画什么 | 必须吗 |
|---|---|---|---|
| 1 | `animal_chicken.png` | 成年鸡（白色） | ✅ |
| 2 | `animal_sheep.png` | 成年羊（白卷毛） | ✅ |
| 3 | `animal_cow.png` | 成年牛（黑白花纹） | ✅ |
| 4 | `item_egg.png` | 鸡蛋图标 | ⬜ 可缓 |
| 5 | `item_wool.png` | 羊毛图标 | ⬜ 可缓 |
| 6 | `item_milk.png` | 牛奶图标 | ⬜ 可缓 |

**幼崽不用做** —— 游戏里现在是"把成年图缩小 62%"来当幼崽的，够用。以后觉得不自然再补。

---

## 1. 通用要求

- **格式**：PNG（抠好背景、透明）。带白底也行，我来尝试抠，但你自己用抠图工具最干净
- **视角**：**等距、约 30° 俯视**（和现在的土块、玉米一致 —— 斜着往下看，能看到一点背）
- **朝向**：**朝右**
- **姿势**：正常站姿
- **比例**：写实比例、**不要 Q 版大头**、不要粗黑描边
- **光影**：光从**左上**打下来（跟现有素材一致）
- **尺寸**：出图时不用管，我负责缩放对齐。建议主体占画面 70% 左右
- **风格参照**：就是现在游戏里那块深棕土 + 亮绿玉米的味道

---

## 2. 提示词（国内工具直接粘）

### 鸡
```
等距视角的农场母鸡，白色羽毛、红色鸡冠，侧面略微俯视约30度，
站立姿势，朝右，写实比例不要Q版大头，轻卡通风格，没有黑色描边，
纯白背景，单个物体居中，游戏素材
```

### 羊
```
等距视角的绵羊，白色蓬松卷毛、深灰色脸，侧面略微俯视约30度，
站立姿势，朝右，写实比例不要Q版，轻卡通风格，没有黑色描边，
纯白背景，单个物体居中，游戏素材
```

### 牛
```
等距视角的奶牛，黑白花纹、粉色鼻子，侧面略微俯视约30度，
站立姿势，朝右，写实比例不要Q版，轻卡通风格，没有黑色描边，
纯白背景，单个物体居中，游戏素材
```

### 产物图标（这三个是普通图标，不用等距）
```
游戏道具图标，一个鸡蛋，正面略俯视，轻卡通风格，没有黑色描边，纯白背景，居中
```
```
游戏道具图标，一团白色羊毛，轻卡通风格，没有黑色描边，纯白背景，居中
```
```
游戏道具图标，一瓶牛奶（玻璃瓶装），轻卡通风格，没有黑色描边，纯白背景，居中
```

**英文版**（有些工具英文效果更稳）：
```
isometric farm hen, white feathers, red comb, side view slightly from above (30 degrees),
standing, facing right, realistic proportions (not chibi), soft cartoon style,
no black outline, plain white background, single object centered, game asset
```
```
isometric sheep, white fluffy wool, dark grey face, side view slightly from above,
standing, facing right, realistic proportions, soft cartoon style,
no black outline, plain white background, single object centered, game asset
```
```
isometric dairy cow, black and white patches, side view slightly from above,
standing, facing right, realistic proportions, soft cartoon style,
no black outline, plain white background, single object centered, game asset
```

---

## 3. 图放哪、怎么给我

**放进这个文件夹**（我已经建好了）：

```
C:\Users\Lenovo\Documents\英雄小镇\_asset_downloads\animals
```

放好之后跟我说一声就行。或者直接在对话里把图发我也行。

> 这个文件夹被 `.gitignore` 排除了 —— 不会进版本库、不会占游戏包体 ✓

---

## 4. 拿到图之后我做什么

1. **抠背景**（如果还有白底）、**缩放到统一尺寸**
2. **拼成预览图**：把三只动物放进"牧场围栏"里，看看跟现在的土块、玉米搭不搭
3. **给你看预览** ← **你点头我才会导进项目**
4. 顺便处理**朝向**：如果你出的图朝左，我会镜像过来（游戏里往左走会自动翻转，所以源图必须统一）

---

## 5. 出图小技巧

- 一次生成 4 张，挑 1 张最像的
- **风格不一致是最常见的问题**：如果三只动物看起来像三个游戏里的，就换同一个模型/同一套提示词重来
- 如果 AI 出的鸡实在不满意，**我们还有备选**：之前下载的 CC0 素材里有现成的白鸡（公共领域，可商用）

---

## 6. 包体预算

3 只动物 + 3 个图标，加起来大概 **100~200KB**（每张控制在 60KB 以内）。
主包现在 **1.92MB**，上限 4MB，完全不用担心。
