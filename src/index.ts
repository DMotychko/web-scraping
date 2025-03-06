import puppeteer from "puppeteer";
import * as fs from "fs-extra";
import * as path from "path";

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    // Відкриваємо сторінку каталогів
    await page.goto("https://www.tus.si/#s2", { waitUntil: "networkidle2" });

    // Очікуємо завантаження блоків каталогів
    await page.waitForSelector(".list-item");

    // Отримуємо всі каталоги
    const catalogs = await page.evaluate(() => {
        return [...document.querySelectorAll(".list-item")].map(catalog => {
            const linkElement = catalog.querySelector("h3 a");
            return {
                title: linkElement?.textContent?.trim() || "Без назви",
                link: linkElement instanceof HTMLAnchorElement ? linkElement.href : "Немає посилання",
                date: "", // Поки що пусте поле для дати
                pdf: "" // Поки що пусте поле для PDF
            };
        });
    });

    // Створюємо директорію для PDF
    const downloadPath = path.join(process.cwd(), "downloads");
    await fs.ensureDir(downloadPath);

    // Проходимо по кожному каталогу та шукаємо PDF і дату
    for (const catalog of catalogs) {
        if (!catalog.link || catalog.link === "Немає посилання") continue;

        await page.goto(catalog.link, { waitUntil: "networkidle2" });

        // Очікуємо на елемент, який містить дату
        await page.waitForSelector("time");

        // Витягуємо дату дії каталогу
        catalog.date = await page.evaluate(() => {
            const times = document.querySelectorAll("time");
            if (times.length === 2) {
                return `${times[0]?.textContent?.trim()} - ${times[1]?.textContent?.trim()}`;
            }
            return "Немає дати";
        });

        // Шукаємо посилання на PDF в <figcaption> з класом "pdf"
        const pdfLink = await page.evaluate(() => {
            const pdfLinkElement = document.querySelector("figcaption a.pdf") as HTMLAnchorElement;
            return pdfLinkElement ? pdfLinkElement.href : "";

        });

        if (pdfLink) {
            catalog.pdf = pdfLink;
            const pdfPath = path.join(downloadPath, `${catalog.title.replace(/[/\\:*?"<>|]/g, "_")}.pdf`);
            const pdf = await page.goto(pdfLink);
            if (pdf) {
                await fs.writeFile(pdfPath, await pdf.buffer());
                console.log(`Завантажено: ${pdfPath}`);
            }
        } else {
            console.log(`PDF для каталогу ${catalog.title} не знайдено.`);
        }
    }

    // Зберігаємо інформацію в JSON
    const jsonPath = path.join(process.cwd(), "catalogs.json");
    await fs.writeJson(jsonPath, catalogs, { spaces: 2 });
    console.log("Збережено в JSON:", jsonPath);

    await browser.close();
})();
