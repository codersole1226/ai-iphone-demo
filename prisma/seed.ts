import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import mysql from "mysql2/promise";

type SeedProduct = {
    name: string;
    price: number;
    intro: string; // 写到 product_descriptions.intro
};

const seedData: SeedProduct[] = [
    {
        name: "Apple iPhone 15",
        price: 5999,
        intro:
            "苹果最新一代 iPhone，整体体验均衡，适合追求流畅使用体验与生态联动的用户。",
    },
    {
        name: "Xiaomi 14",
        price: 3999,
        intro:
            "小米旗舰机型，主打性能与性价比，适合预算更敏感但想要旗舰体验的人。",
    },
    {
        name: "MacBook Air M3",
        price: 8999,
        intro:
            "轻薄本代表，续航与性能兼顾，适合学习办公与日常创作等场景。",
    },
    {
        name: "iPad Air",
        price: 4799,
        intro:
            "介于入门与 Pro 之间的平衡款，适合学习、手写记录和轻办公。",
    },
];

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name} (check .env.local)`);
    return v;
}

async function main() {
    const host = mustEnv("MYSQL_HOST");
    const port = Number(process.env.MYSQL_PORT || 3306);
    const user = mustEnv("MYSQL_USER");
    const password = mustEnv("MYSQL_PASSWORD");
    const database = mustEnv("MYSQL_DATABASE");

    console.log("seed: mysql2 connecting", { host, port, user, database });

    const pool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        connectionLimit: 10,
    });

    try {
        // 0) 连通性自检
        console.log("seed: pool test...");
        const [ping] = await pool.query("SELECT 1 AS ok");
        console.log("seed: pool test ok ✅", ping);

        // 1) 写 products（幂等）
        console.log("seed: upsert products...");
        for (const p of seedData) {
            await pool.query(
                `
        INSERT INTO products (name, price)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          price = VALUES(price)
        `,
                [p.name, p.price]
            );
        }
        console.log("seed: products ok ✅");

        // 2) 拿到 products 的 id（用 name 反查）
        console.log("seed: fetch product ids...");
        const names = seedData.map((x) => x.name);
        const placeholders = names.map(() => "?").join(",");
        const [rows] = await pool.query(
            `SELECT id, name FROM products WHERE name IN (${placeholders})`,
            names
        );

        const idByName = new Map<string, number>();
        (rows as any[]).forEach((r) => idByName.set(r.name, r.id));

        // 3) 写 product_descriptions（幂等）
        console.log("seed: upsert product_descriptions...");
        for (const p of seedData) {
            const productId = idByName.get(p.name);
            if (!productId) {
                console.warn("seed: missing product id for:", p.name);
                continue;
            }

            await pool.query(
                `
        INSERT INTO product_descriptions (productId, intro)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          intro = VALUES(intro)
        `,
                [productId, p.intro]
            );
        }
        console.log("seed: product_descriptions ok ✅");

        // 4) 输出结果验证
        const [check] = await pool.query(
            `
      SELECT p.id, p.name, p.price, d.intro
      FROM products p
      LEFT JOIN product_descriptions d ON d.productId = p.id
      ORDER BY p.id ASC
      `
        );

        console.log("seed: final check:");
        console.table(check as any[]);

        console.log("🌱 Seed 完成");
    } finally {
        await pool.end();
    }
}

main().catch((e) => {
    console.error("❌ seed failed:", e);
    process.exit(1);
});