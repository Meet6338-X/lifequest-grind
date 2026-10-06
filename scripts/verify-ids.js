const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "lifequest-app");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const jsFiles = ["store", "companion", "music", "integrations", "market", "archive", "rooms", "app"];
const js = jsFiles.map((f) => fs.readFileSync(path.join(root, "js", f + ".js"), "utf8")).join("\n");

const ids = [...js.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
const uniq = [...new Set(ids)];
const missing = uniq.filter((id) => !html.includes('id="' + id + '"'));
console.log("referenced ids:", uniq.length);
console.log("missing:", missing.length ? missing.join(", ") : "none");

// check querySelector data-view targets
const views = [...html.matchAll(/id="view-([a-z]+)"/g)].map((m) => m[1]);
console.log("views:", views.join(", "));

// check css files exist
["css/themes.css", "css/app.css"].forEach((p) => {
  console.log(p, fs.existsSync(path.join(root, p)) ? "ok" : "MISSING");
});

// check assets
const bgDir = path.join(root, "assets", "backgrounds");
if (fs.existsSync(bgDir)) {
  console.log("backgrounds:", fs.readdirSync(bgDir).join(", "));
} else {
  console.log("backgrounds: MISSING DIR");
}
