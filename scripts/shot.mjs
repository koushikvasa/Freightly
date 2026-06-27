// Drive the app with headless Edge and screenshot the results state.
import puppeteer from "puppeteer-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT = process.env.TEMP + "\\freightly-results.png";

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=860,1600"],
});
const page = await browser.newPage();
await page.setViewport({ width: 860, height: 1600, deviceScaleFactor: 1 });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle2" });

await page.click("button.go");
// Wait for the recommended stamp to render.
await page.waitForSelector(".stamp", { timeout: 60000 });
// Give Leaflet time to load tiles + draw.
await new Promise((r) => setTimeout(r, 4000));

await page.screenshot({ path: OUT, fullPage: true });
console.log("Saved:", OUT);
await browser.close();
