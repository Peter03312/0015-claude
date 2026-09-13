import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

/** 录入一条实物观察：参考环索引 + 看见/未见待装版箭头 */
async function recordObs(page: Page, index: number, seen: 'seen' | 'unseen') {
  await page.getByTestId('obs-index').fill(String(index));
  await page.getByTestId('obs-seen').selectOption(seen);
  await page.getByTestId('obs-add').click();
}

test('录入：合法孔序实时得出唯一可装相位，含移动孔数、箭头新位置与全部孔对', async ({ page }) => {
  // 首尾及连续空格应被忽略
  await page.getByTestId('ref-seq').fill('  A  B   C D ');
  await page.getByTestId('cand-seq').fill('B C D A');

  await expect(page.getByTestId('ref-count')).toHaveText('已解析 4 孔');
  await expect(page.getByTestId('cand-count')).toHaveText('已解析 4 孔');

  const result = page.getByTestId('result-unique');
  await expect(result).toBeVisible();
  await expect(result).toContainText('可装');
  await expect(result).toContainText('移动孔数：顺时针 1 孔');
  await expect(result).toContainText('箭头新位置：参考环索引 1');
  // 全部孔对：参考索引 0..3 对应待装索引 3,0,1,2
  const rows = page.getByTestId('pairs').locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toHaveText(/0\s*A\s*3\s*A/);
  await expect(rows.nth(1)).toHaveText(/1\s*B\s*0\s*B/);
  await expect(rows.nth(3)).toHaveText(/3\s*D\s*2\s*D/);

  // 调整待装版箭头起始孔，结论随编辑立即更新（k 由 1 变为 2）
  await page.getByTestId('cand-arrow').selectOption('1');
  await expect(result).toContainText('移动孔数：顺时针 2 孔');
  await expect(result).toContainText('箭头新位置：参考环索引 2');
});

test('纠错：非法字符、孔数越界、孔数不同依次报错，修正后恢复结论', async ({ page }) => {
  await page.getByTestId('ref-seq').fill('A B E D');
  await page.getByTestId('cand-seq').fill('A B C D');
  const error = page.getByTestId('error');
  await expect(error).toBeVisible();
  await expect(error).toContainText('非法');
  await expect(error).toContainText('参考版');
  await expect(page.getByTestId('result-unique')).toHaveCount(0);

  // 修正非法字符后，孔数不同立即报错
  await page.getByTestId('ref-seq').fill('A B C D');
  await page.getByTestId('cand-seq').fill('A B C D A');
  await expect(error).toContainText('两环孔数必须相同');

  // 孔数越界
  await page.getByTestId('cand-seq').fill('A B C');
  await expect(error).toContainText('4–48');

  // 全部修正后错误消失并给出结论
  await page.getByTestId('cand-seq').fill('B C D A');
  await expect(page.getByTestId('error')).toHaveCount(0);
  await expect(page.getByTestId('result-unique')).toBeVisible();
});

test('三类结果互斥：可装 / 无匹配 / 相位不唯一', async ({ page }) => {
  const unique = page.getByTestId('result-unique');
  const none = page.getByTestId('result-none');
  const multiple = page.getByTestId('result-multiple');

  // 可装
  await page.getByTestId('ref-seq').fill('A B C D');
  await page.getByTestId('cand-seq').fill('B C D A');
  await expect(unique).toBeVisible();
  await expect(none).toHaveCount(0);
  await expect(multiple).toHaveCount(0);

  // 无匹配：诊断相位 k=0，错 2 孔，首个错孔为参考索引 2
  await page.getByTestId('ref-seq').fill('A A A B');
  await page.getByTestId('cand-seq').fill('A A C D');
  await expect(none).toBeVisible();
  await expect(none).toContainText('无匹配');
  await expect(none).toContainText('k = 0');
  await expect(none).toContainText('共 2 孔不符');
  await expect(none).toContainText('首个错孔：参考索引 2，参考孔 A ≠ 待装孔 C');
  await expect(unique).toHaveCount(0);
  await expect(multiple).toHaveCount(0);

  // 相位不唯一：ABAB 周期序列，k = 0、2
  await page.getByTestId('ref-seq').fill('A B A B');
  await page.getByTestId('cand-seq').fill('A B A B');
  await expect(multiple).toBeVisible();
  await expect(multiple).toContainText('相位不唯一');
  await expect(multiple).toContainText('k = 0、2');
  await expect(unique).toHaveCount(0);
  await expect(none).toHaveCount(0);
});

test('结果失效：编辑任一输入立即清除旧结论', async ({ page }) => {
  await page.getByTestId('ref-seq').fill('A B C D');
  await page.getByTestId('cand-seq').fill('B C D A');
  await expect(page.getByTestId('result-unique')).toBeVisible();

  // 编辑参考版引入非法字符：旧结论立即消失，仅显示错误
  await page.getByTestId('ref-seq').fill('A B C D X');
  await expect(page.getByTestId('result-unique')).toHaveCount(0);
  await expect(page.getByTestId('error')).toBeVisible();

  // 修复后得到新结论；再编辑待装版为周期序列，旧的可装结论被“相位不唯一”替换
  await page.getByTestId('ref-seq').fill('A B A B');
  await page.getByTestId('cand-seq').fill('A B A B');
  await expect(page.getByTestId('result-unique')).toHaveCount(0);
  await expect(page.getByTestId('result-multiple')).toBeVisible();

  // 清空任一输入：所有结论消失，回到待录入状态
  await page.getByTestId('cand-seq').fill('');
  await expect(page.getByTestId('result-multiple')).toHaveCount(0);
  await expect(page.getByTestId('error')).toHaveCount(0);
  await expect(page.getByTestId('idle')).toBeVisible();
});

test('观察排除：ABAB 歧义经否定观察收敛为唯一相位，含移动孔数与原有孔对', async ({ page }) => {
  await page.getByTestId('ref-seq').fill('A B A B');
  await page.getByTestId('cand-seq').fill('A B A B');

  const multiple = page.getByTestId('result-multiple');
  await expect(multiple).toBeVisible();
  await expect(multiple).toContainText('k = 0、2');
  // 未观察时剩余全部候选，并提示继续观察
  await expect(page.getByTestId('remaining-phases')).toContainText('k = 0、2');

  // 在参考索引 0 未见待装版箭头 → 排除 k=0，收敛到 k=2
  await recordObs(page, 0, 'unseen');

  await expect(page.getByTestId('obs-list').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('obs-list')).toContainText('参考索引 0：未见箭头');

  const resolved = page.getByTestId('obs-resolved');
  await expect(resolved).toBeVisible();
  await expect(resolved).toContainText('移动孔数：顺时针 2 孔');
  await expect(resolved).toContainText('箭头新位置：参考环索引 2');
  // 原有孔对：参考索引 0..3 对应待装索引 2,3,0,1
  const rows = resolved.getByTestId('pairs').locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toHaveText(/0\s*A\s*2\s*A/);
  await expect(rows.nth(3)).toHaveText(/3\s*B\s*1\s*B/);
  // 基础候选仍展示，可装/无匹配结论不出现
  await expect(multiple).toContainText('k = 0、2');
  await expect(page.getByTestId('result-unique')).toHaveCount(0);
  await expect(page.getByTestId('result-none')).toHaveCount(0);
});

test('观察排除：AAAA 四候选逐步排除，剩余相位随观察即时更新', async ({ page }) => {
  await page.getByTestId('ref-seq').fill('A A A A');
  await page.getByTestId('cand-seq').fill('A A A A');

  const remaining = page.getByTestId('remaining-phases');
  await expect(remaining).toContainText('k = 0、1、2、3');

  await recordObs(page, 0, 'unseen');
  await expect(remaining).toContainText('k = 1、2、3');

  await recordObs(page, 1, 'unseen');
  await expect(remaining).toContainText('k = 2、3');

  // 在参考索引 3 看见箭头 → 收敛为唯一相位 k=3
  await recordObs(page, 3, 'seen');
  const resolved = page.getByTestId('obs-resolved');
  await expect(resolved).toBeVisible();
  await expect(resolved).toContainText('移动孔数：顺时针 3 孔');
  await expect(page.getByTestId('remaining-phases')).toHaveCount(0);
});

test('矛盾观察：全部候选被排除时提示观察与孔序不一致，保留基础候选，可一键清空', async ({ page }) => {
  await page.getByTestId('ref-seq').fill('A B A B');
  await page.getByTestId('cand-seq').fill('A B A B');
  await expect(page.getByTestId('remaining-phases')).toContainText('k = 0、2');

  // 先在索引 0 看见箭头 → 收敛 k=0；又在索引 2 看见箭头 → 无任何 k 能同时成立
  await recordObs(page, 0, 'seen');
  await expect(page.getByTestId('obs-resolved')).toContainText('移动孔数：顺时针 0 孔');

  await recordObs(page, 2, 'seen');
  const contradiction = page.getByTestId('obs-contradiction');
  await expect(contradiction).toBeVisible();
  await expect(contradiction).toContainText('观察与孔序不一致');
  await expect(page.getByTestId('obs-resolved')).toHaveCount(0);
  // 基础候选保留，两条观察仍在记录中
  await expect(page.getByTestId('result-multiple')).toContainText('k = 0、2');
  await expect(page.getByTestId('obs-list').locator('li')).toHaveCount(2);

  // 清空全部观察后回到全部候选
  await page.getByTestId('obs-clear').click();
  await expect(page.getByTestId('obs-list').locator('li')).toHaveCount(0);
  await expect(contradiction).toHaveCount(0);
  await expect(page.getByTestId('remaining-phases')).toContainText('k = 0、2');
});

test('观察录入：索引越界在录入处反馈且不改变当前筛选结果', async ({ page }) => {
  await page.getByTestId('ref-seq').fill('A B A B');
  await page.getByTestId('cand-seq').fill('A B A B');

  // 先收敛到唯一相位
  await recordObs(page, 0, 'unseen');
  await expect(page.getByTestId('obs-resolved')).toContainText('移动孔数：顺时针 2 孔');

  // 索引越界（n=4，合法范围 0–3）：录入处报错，筛选结果不变
  await recordObs(page, 5, 'seen');
  const obsError = page.getByTestId('obs-error');
  await expect(obsError).toBeVisible();
  await expect(obsError).toContainText('0–3');
  await expect(page.getByTestId('obs-resolved')).toContainText('移动孔数：顺时针 2 孔');
  await expect(page.getByTestId('obs-list').locator('li')).toHaveCount(1);

  // 非整数索引同样被拒绝
  await page.getByTestId('obs-index').fill('x');
  await page.getByTestId('obs-add').click();
  await expect(obsError).toBeVisible();
  await expect(page.getByTestId('obs-list').locator('li')).toHaveCount(1);

  // 合法索引替换同索引旧值后错误消失
  await recordObs(page, 0, 'seen');
  await expect(page.getByTestId('obs-error')).toHaveCount(0);
  await expect(page.getByTestId('obs-list').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('obs-list')).toContainText('参考索引 0：看见箭头');
  await expect(page.getByTestId('obs-resolved')).toContainText('移动孔数：顺时针 0 孔');
});

test('录入校验：制表符、不换行空格、全角空格不作为孔序分隔符', async ({ page }) => {
  const error = page.getByTestId('error');

  // 制表符分隔的四孔不被识别为合法序列
  await page.getByTestId('ref-seq').fill('A\tB\tC\tD');
  await page.getByTestId('cand-seq').fill('A B C D');
  await expect(error).toBeVisible();
  await expect(error).toContainText('非法');
  await expect(page.getByTestId('result-unique')).toHaveCount(0);
  await expect(page.getByTestId('ref-count')).toHaveText('等待有效孔序');

  // 不换行空格（U+00A0）
  await page.getByTestId('ref-seq').fill('A B C D');
  await page.getByTestId('cand-seq').fill('A B C D');
  await expect(error).toBeVisible();
  await expect(error).toContainText('待装版');

  // 全角空格（U+3000）
  await page.getByTestId('cand-seq').fill('A　B　C　D');
  await expect(error).toBeVisible();
  await expect(page.getByTestId('result-unique')).toHaveCount(0);

  // 改为普通空格分隔后恢复结论
  await page.getByTestId('cand-seq').fill('B C D A');
  await expect(page.getByTestId('error')).toHaveCount(0);
  await expect(page.getByTestId('result-unique')).toBeVisible();
});

test('观察录入：十六进制与指数格式索引被拒绝，不生成观察记录', async ({ page }) => {
  await page.getByTestId('ref-seq').fill('A B A B');
  await page.getByTestId('cand-seq').fill('A B A B');
  await expect(page.getByTestId('remaining-phases')).toContainText('k = 0、2');

  const obsError = page.getByTestId('obs-error');
  const obsList = page.getByTestId('obs-list').locator('li');

  // 十六进制文本（Number('0x0') === 0）应被拒绝
  await page.getByTestId('obs-index').fill('0x0');
  await page.getByTestId('obs-add').click();
  await expect(obsError).toBeVisible();
  await expect(obsError).toContainText('十进制整数');
  await expect(obsList).toHaveCount(0);
  await expect(page.getByTestId('remaining-phases')).toContainText('k = 0、2');

  // 指数格式文本（Number('2e0') === 2）同样拒绝
  await page.getByTestId('obs-index').fill('2e0');
  await page.getByTestId('obs-add').click();
  await expect(obsError).toBeVisible();
  await expect(obsList).toHaveCount(0);

  // 普通十进制整数仍被接受，错误消失，正常收敛
  await page.getByTestId('obs-index').fill('0');
  await page.getByTestId('obs-seen').selectOption('unseen');
  await page.getByTestId('obs-add').click();
  await expect(page.getByTestId('obs-error')).toHaveCount(0);
  await expect(obsList).toHaveCount(1);
  await expect(page.getByTestId('obs-resolved')).toContainText('移动孔数：顺时针 2 孔');
});

test('观察失效：修改任一孔序或箭头起点都会清除观察记录', async ({ page }) => {
  await page.getByTestId('ref-seq').fill('A B A B');
  await page.getByTestId('cand-seq').fill('A B A B');
  await recordObs(page, 0, 'unseen');
  await expect(page.getByTestId('obs-resolved')).toBeVisible();
  await expect(page.getByTestId('obs-list').locator('li')).toHaveCount(1);

  // 修改孔序：观察清除，候选按新孔序重算
  await page.getByTestId('ref-seq').fill('A B A B A B');
  await page.getByTestId('cand-seq').fill('A B A B A B');
  await expect(page.getByTestId('obs-list').locator('li')).toHaveCount(0);
  await expect(page.getByTestId('obs-resolved')).toHaveCount(0);
  await expect(page.getByTestId('remaining-phases')).toContainText('k = 0、2、4');

  // 再次记录观察后修改箭头起点，观察同样失效
  await recordObs(page, 0, 'seen');
  await expect(page.getByTestId('obs-list').locator('li')).toHaveCount(1);
  await page.getByTestId('cand-arrow').selectOption('1');
  await expect(page.getByTestId('obs-list').locator('li')).toHaveCount(0);
  await expect(page.getByTestId('obs-resolved')).toHaveCount(0);
});
