// import { ProxyAgent, setGlobalDispatcher } from "undici";
// setGlobalDispatcher(new ProxyAgent("http://127.0.0.1:7897"));

import OpenAI from "openai";
import { pool } from "../../../lib/db";
type Product = { id: number; name: string; price: number };

type ProductWithIntro = Product & { intro: string | null };
export const runtime = "nodejs";

// ✅ 百炼 OpenAI 兼容：只要换 apiKey + baseURL + model
const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL:
        process.env.DASHSCOPE_BASE_URL ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
});


// 工具列表
async function search_products(query: string): Promise<Product[]> {
    console.log('query', query)
    const q = query.toLowerCase().replace("ipone", "iphone");
    const [rows] = await pool.query(
        "SELECT id, name, price FROM products WHERE LOWER(name) LIKE ? ORDER BY price DESC LIMIT 20",
        [`%${q}%`]
    );
    return rows as Product[];
}

async function get_most_expensive_product(): Promise<Product | null> {
    const [rows] = await pool.query(
        "SELECT id, name, price FROM products ORDER BY price DESC LIMIT 1"
    );
    const list = rows as Product[];
    return list[0] ?? null;
}
async function get_cheapest_product(): Promise<ProductWithIntro | null> {
    const [rows] = await pool.query(
        "select p.id, p.name,p.price,d.intro from products p left join product_descriptions d on p.id = d.productId order by p.price asc limit 1"
    )
    const list = rows as ProductWithIntro[]
    return list[0] ?? null
}

export async function POST(req: Request) {
    try {
        const { message } = await req.json();
        console.log(message, '😁')

        const model = process.env.QWEN_MODEL || "qwen-plus";

        // ✅ 工具声明
        const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
            {
                type: "function",
                function: {
                    name: "search_products",
                    description: "根据关键词在商品库中搜索商品，返回匹配列表",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "搜索关键词，比如 iphone" },
                        },
                        required: ["query"],
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "get_most_expensive_product",
                    description: "返回数据库中价格最高的商品，用于回答“哪个商品最贵/价格最高的是哪个”",
                    parameters: { type: "object", properties: {} },
                },
            },
            {
                type: "function",
                function: {
                    name: "get_cheapest_product",
                    description: "返回数据库中价格最低的商品，用于回答“哪个商品最便宜/价格最低的是哪个”",
                    parameters: { type: "object", properties: {} },
                },
            },
        ];

        // 1) 第一轮：触发工具
        const first = await client.chat.completions.create({
            model,
            messages: [{ role: "user", content: String(message ?? "") }],
            tools,
            tool_choice: "auto",
        });


        const toolCall = first.choices[0]?.message?.tool_calls?.[0];
        console.log('🐟', toolCall)

        if (!toolCall) {
            return Response.json({
                answer: first.choices[0]?.message?.content ?? "没有触发工具调用",
            });
        }

        // 2) 执行工具
        const toolName = toolCall.function.name;
        const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
        console.log(args, '😋')
        let toolResult: any;
        if (toolName === "search_products") {
            // 如果模型没给 query，就从用户文本里尽量提取（例如“查iphone”）
            const query =
                String(args.query ?? "").trim()
            toolResult = await search_products(query);
        } else if (toolName === "get_most_expensive_product") {
            toolResult = await get_most_expensive_product();
        } else if (toolName === 'get_cheapest_product') {
            toolResult = await get_cheapest_product()
        }
        else {
            return Response.json({ answer: `未知工具：${toolName}` }, { status: 400 });
        }

        // 3) 第二轮：把工具结果回传，让模型生成最终回答
        const second = await client.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content:
                        "你是电商文案助手。请用中文基于工具结果回答，并允许对 intro 进行润色改写。\n" +
                        "硬性规则：\n" +
                        "1) 只能依据工具返回的数据回答，不能编造任何新事实（比如性能参数、配置、续航、屏幕、年份等），也不能引入数据库里没有的信息。\n" +
                        "2) 允许对 intro 进行：改写、扩写、重组语序、增加衔接句、增加轻度推荐语气（比如“适合…”“如果你想要…”），但必须保持事实不变。\n" +
                        "3) 不要输出代码/函数名/括号/print。\n" +
                        "输出格式：\n" +
                        "- 先给一句结论：最便宜的商品是「name」，价格 price 元。\n" +
                        "- 然后给 2-4 句润色后的介绍（基于 intro）。\n" +
                        "- 最后可加 1 句很保守的建议（不包含具体参数）。\n"
                },
                { role: "user", content: String(message ?? "") },
                first.choices[0].message, // ✅ 把包含 tool_calls 的那条 message 传回去
                {
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({ result: toolResult }),
                },

            ],
        });

        return Response.json({ answer: second.choices[0]?.message?.content ?? "" });
    } catch (e: any) {
        console.error(e);
        return Response.json(
            { answer: "服务端报错：" + (e?.message ?? "unknown error") },
            { status: 500 }
        );
    }
}