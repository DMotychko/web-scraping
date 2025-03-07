import puppeteer, { Page } from "puppeteer";
import * as fs from "fs-extra";
import * as path from "path";
import axios from "axios";

interface Catalog {
    title: string;
    link: string;
    date: string;
    pdf: string;
}

const downloadPDF = async (url: string, filename: string, folder: string): Promise<void> => {
    const filePath = path.join(folder, filename);
    const { data } = await axios({ url, responseType: "stream" });
    data.pipe(fs.createWriteStream(filePath));
    await new Promise((resolve) => data.on("end", resolve));
};

const fetchCatalogs = async (page: Page): Promise<Catalog[]> => {
    return page.evaluate(() =>
        [...document.querySelectorAll("ul.custom-slick-slider.js-slick-slider.slick-initialized.slick-slider:not(.custom-slick-slider-recipe) .list-item")].map(catalog => {
            const linkElement = catalog.querySelector("h3 a") as HTMLAnchorElement | null;
            const pdfElement = catalog.querySelector("a[href$='.pdf']") as HTMLAnchorElement | null;
            const timeElements = [...catalog.querySelectorAll("p time")].map(t => t.textContent?.trim()).join(" - ") || "Немає дати";

            return {
                title: linkElement?.textContent?.trim() || "Без назви",
                link: linkElement?.href || "",
                date: timeElements,
                pdf: pdfElement?.href || ""
            };
        })
    );
};

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto("https://www.tus.si/#s2", { waitUntil: "networkidle2" });
    await page.waitForSelector(".list-item");

    const catalogs: Catalog[] = await fetchCatalogs(page);
    const downloadPath: string = path.join(process.cwd(), "downloads");
    await fs.ensureDir(downloadPath);

    await Promise.all(catalogs.map(catalog =>
        catalog.pdf ? downloadPDF(catalog.pdf, catalog.title.replace(/\W+/g, "_") + ".pdf", downloadPath) : Promise.resolve()
    ));

    await fs.writeJson(path.join(process.cwd(), "catalogs.json"), catalogs, { spaces: 2 });
    await browser.close();
})();
