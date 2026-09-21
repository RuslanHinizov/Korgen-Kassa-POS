import { mkdir } from "node:fs/promises";
import sharp from "../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js";

const source = "public/Menu Foto.png";
const output = "public/category-menu";
const cells = {
  "Овощи и фрукты": [0, 0], "Молочные продукты": [1, 0], "Мясо и колбасы": [2, 0],
  "Хлеб и выпечка": [3, 0], "Напитки": [4, 0], "Снеки": [0, 1],
  "Кондитерские изделия": [1, 1], "Бакалея": [2, 1], "Замороженные продукты": [4, 1],
  "Бытовая химия": [0, 2], "Гигиена": [1, 2],
};
await mkdir(output, { recursive: true });
for (const [index, [name, [col, row]]] of Object.entries(cells).entries()) {
  // Keep only the photograph. The POS renders one clean title itself below the image.
  await sharp(source).extract({ left: 15 + col * 305, top: 10 + row * 257, width: 290, height: 175 }).resize(320, 320, { fit: "cover" }).png().toFile(`${output}/${index}.png`);
}
console.log(`Created ${Object.keys(cells).length} category images.`);
