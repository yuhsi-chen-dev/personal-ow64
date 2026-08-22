// 9x9 曼陀羅座標的唯一來源。次目標同時出現在中央區塊與外圍區塊中心，
// 兩處都必須由這裡產生，不要在別處各寫一次。見 docs/domain.md。

export const SIZE = 9;
export const SLOTS = 8; // 每個 3x3 區塊裡的非中心格數

/** 3x3 區塊內 8 個非中心格的位移，row-major 固定順序。索引即 slot 0..7。 */
const OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0], [0, 1], [0, 2],
  [1, 0], /*中心*/ [1, 2],
  [2, 0], [2, 1], [2, 2],
];

export type Coord = readonly [row: number, col: number];

/** 取 slot i 的位移。越界是呼叫端的 bug，直接擋下來不要回傳壞座標。 */
function offset(i: number): readonly [number, number] {
  const off = OFFSETS[i];
  if (!off) throw new RangeError(`slot 必須是 0..${SLOTS - 1}，收到 ${i}`);
  return off;
}

/** 核心目標：中央區塊的中心格。 */
export const CORE_COORD: Coord = [4, 4];

/** 次目標 i 在中央區塊裡的位置。 */
export function subGoalCoordInCore(i: number): Coord {
  const [r, c] = offset(i);
  return [3 + r, 3 + c];
}

/** 次目標 i 所屬外圍區塊的中心格（同一個次目標的第二個座標）。 */
export function subGoalCoordInBlock(i: number): Coord {
  const [r, c] = offset(i);
  return [r * 3 + 1, c * 3 + 1];
}

/** 次目標 i 底下第 j 項具體行為的位置。 */
export function actionCoord(i: number, j: number): Coord {
  const [br, bc] = offset(i);
  const [ar, ac] = offset(j);
  return [br * 3 + ar, bc * 3 + ac];
}

export type Cell =
  | { kind: "core" }
  | { kind: "subGoal"; subGoal: number; mirrored: boolean }
  | { kind: "action"; subGoal: number; action: number };

/** 整張 9x9 的格子語意，row-major 81 格。渲染與匯出都走這個。 */
export function layout(): Cell[] {
  const cells = new Array<Cell>(SIZE * SIZE);
  const put = ([r, c]: Coord, cell: Cell) => (cells[r * SIZE + c] = cell);

  put(CORE_COORD, { kind: "core" });
  for (let i = 0; i < SLOTS; i++) {
    put(subGoalCoordInCore(i), { kind: "subGoal", subGoal: i, mirrored: false });
    put(subGoalCoordInBlock(i), { kind: "subGoal", subGoal: i, mirrored: true });
    for (let j = 0; j < SLOTS; j++) {
      put(actionCoord(i, j), { kind: "action", subGoal: i, action: j });
    }
  }
  return cells;
}

/** 外層 3×3 的區塊編號 0..8（row-major）。中央區塊固定是 4。 */
export const CORE_BLOCK = 4;

/** 次目標 slot 所屬的外圍區塊編號。 */
export function blockIndexOfSlot(slot: number): number {
  const [r, c] = offset(slot);
  return r * 3 + c;
}

