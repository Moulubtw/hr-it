import { expect, test, type Page } from "@playwright/test";

async function startInterview(page: Page, role = "Аналитик данных") {
  await page.goto("setup/");
  await page.getByPlaceholder("Например, продуктовый дизайнер").fill(role);
  await page.getByText("Стажёр", { exact: true }).click();
  await page.getByText("Щадящий", { exact: true }).click();
  await page.getByText("Вежливый", { exact: true }).click();
  await page.getByRole("button", { name: "Начать интервью" }).click();
  await page.waitForURL(/\/interview\/\?id=/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Почему вы откликнулись");
}

async function answer(page: Page, text: string) {
  await page.getByLabel("Ваш ответ").fill(text);
  await page.getByRole("button", { name: "Ответить" }).click();
  await expect(page.getByRole("heading", { name: "Как ответил бы ИИ" })).toBeVisible();
  // Streaming done when the next-step control appears.
  await expect(page.getByRole("button", { name: "Следующий вопрос" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
});

test("setup asks for a vacancy or a role", async ({ page }) => {
  await page.goto("setup/");
  await page.getByRole("button", { name: "Начать интервью" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Вставьте текст вакансии" })).toBeVisible();
  await expect(page).toHaveURL(/\/setup\/$/);
});

test("full interview: answer, ideal answer, next question, resume, early report, retake", async ({ page }) => {
  await startInterview(page);

  // 8 questions for an intern in gentle mode
  await expect(page.getByText("/08")).toBeVisible();
  await expect(page.getByText("Слушает")).toBeVisible();

  await answer(page, "Мне интересна работа с данными.");
  const sheet = page.getByRole("region", { name: "Как ответил бы ИИ" });
  await expect(sheet).toContainText("[компания]");
  await expect(sheet).toContainText("Что усилить");
  await expect(page.getByRole("img", { name: "Оценка 6 из 10" })).toBeVisible();

  await page.getByRole("button", { name: "Следующий вопрос" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Расскажите о задаче");

  // Unsent text and the current question survive a reload.
  await page.getByLabel("Ваш ответ").fill("Черновик ответа");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Расскажите о задаче");
  await expect(page.getByLabel("Ваш ответ")).toHaveValue("Черновик ответа");

  // Early finish asks first.
  await page.getByRole("link", { name: "Завершить" }).click();
  await expect(page.getByRole("heading", { name: "Интервью ещё не закончено" })).toBeVisible();
  await expect(page.getByText("Отвечено 1 из 8")).toBeVisible();
  await page.getByRole("button", { name: "Получить отчёт" }).click();

  await expect(page.getByText("6.4")).toBeVisible();
  await expect(page.getByText("1 из 8")).toBeVisible();
  await expect(page.getByText("Отчёт · Дубль 01")).toBeVisible();
  await page.getByText("Почему вы откликнулись именно на эту вакансию?").click();
  await expect(page.getByText("Мне интересна работа с данными.")).toBeVisible();

  // Retake opens setup with the same settings.
  await page.getByRole("button", { name: /Ещё дубль/ }).click();
  await page.waitForURL(/\/setup\/$/);
  await expect(page.getByPlaceholder("Например, продуктовый дизайнер")).toHaveValue("Аналитик данных");

  // History on the landing page.
  await page.goto("./");
  const history = page.getByRole("region", { name: "05 / Ваши дубли" });
  await expect(history).toContainText("Дубль 01");
  await expect(history).toContainText("6.4");
});

test("rude tone reaches the interviewer's lines", async ({ page }) => {
  await page.goto("setup/");
  await page.getByPlaceholder("Например, продуктовый дизайнер").fill("Тестировщик");
  await page.getByText("Грубый", { exact: true }).click();
  await expect(page.getByText("Так он звучит")).toBeVisible();
  await page.getByRole("button", { name: "Начать интервью" }).click();
  await page.waitForURL(/\/interview\/\?id=/);
  await answer(page, "Тестирую руками.");
  await expect(page.getByText("«И это всё? Звучит общо. Конкретнее.»")).toBeVisible();
});

test("unknown session shows a way back", async ({ page }) => {
  await page.goto("interview/?id=does-not-exist");
  await expect(page.getByRole("heading", { name: "Сессия не найдена" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Новая сессия/ })).toBeVisible();
});

test("demo build explains that no key is needed", async ({ page }) => {
  await page.goto("setup/");
  await expect(page.getByText("Демо‑сборка: ответы заготовлены, ключ не нужен.")).toBeVisible();
});

test("sessions live in the browser: a reload keeps everything", async ({ page }) => {
  await startInterview(page);
  const url = page.url();
  await page.goto("./");
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Почему вы откликнулись");
});
