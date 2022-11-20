import * as fs from "fs";
import puppeteer from "puppeteer";
import { fileURLToPath } from "node:url";
import type { AstroIntegration, RouteData } from "astro";

export default function astroOGImage({
  config,
}: {
  config: { path: string };
}): AstroIntegration {
  return {
    name: "astro-og-image",
    hooks: {
      "astro:build:done": async ({ dir, pages }) => {
        let path = config.path;
        // Filters all the routes that need OG image

        // // Creates a directory for the images if it doesn't exist already
        let directory = fileURLToPath(new URL(`./assets/ogs`, dir));
        if (!fs.existsSync(directory)) {
          fs.mkdirSync(directory);
        }

        const browser = await puppeteer.launch({
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        for (const { pathname } of pages) {
          // Gets the title
          // Skip URLs that have not been built (draft: true, etc.)
          let title = pathname.length === 0 ? '' : "/" + pathname.slice(0, -1)
          let imagePath = pathname.length === 0 ? 'og-image' : pathname.slice(0, -1).replaceAll("/", '--')

          // Get the html
          const html = fs
            .readFileSync("og-image.html", "utf-8")
            .toString()
            .replace("${title}", title);

          const page = await browser.newPage();
          await page.setContent(html);
          await page.waitForNetworkIdle();
          await page.setViewport({
            width: 1200,
            height: 630,
          });

          await page.screenshot({
            path: fileURLToPath(
              new URL(`./assets/ogs/${imagePath}.png`, dir)
            ),
            encoding: "binary",
          });
        }
        await browser.close();
      },
    },
  };
}