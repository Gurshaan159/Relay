import http from "node:http";
import ExcelJS from "exceljs";
import { randomBytes } from "node:crypto";
export async function fixture(port = 4318) {
  const sessions = new Set<string>();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Orders");
  sheet.addRows([
    ["id", "customer", "status", "amount"],
    ["NS-1042", "Marlow Studio", "overdue", 1250],
    ["NS-1043", "Cedar Supply", "paid", 480],
    ["NS-1044", "Fieldwork Co.", "overdue", 720],
  ]);
  const bytes = await workbook.xlsx.writeBuffer();
  const records = [
    {
      id: "NS-1042",
      customer: "Marlow Studio",
      status: "overdue",
      amount: 1250,
    },
    { id: "NS-1043", customer: "Cedar Supply", status: "paid", amount: 480 },
    {
      id: "NS-1044",
      customer: "Fieldwork Co.",
      status: "overdue",
      amount: 720,
    },
  ];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const shell = (body: string) =>
      `<!doctype html><html><head><title>Northstar Orders · Fixture</title><style>body{font:16px system-ui;background:#f4f7fa;color:#223347;max-width:900px;margin:60px auto}main{padding:40px;background:white;border:1px solid #dde4eb;border-radius:16px}button,a,input{font:inherit;padding:10px;margin:8px 0}button{background:#147d92;color:white;border:0;border-radius:7px}label{display:block}pre{white-space:pre-wrap}small{color:#617386}</style></head><body><main><small>RELAY FIXTURE · FICTIONAL DATA</small>${body}</main></body></html>`;
    if (url.pathname === "/login") {
      if (req.method === "POST") {
        const id = randomBytes(24).toString("hex");
        sessions.add(id);
        res
          .writeHead(302, {
            "Set-Cookie": `relay_fixture_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
            Location: "/orders",
          })
          .end();
        return;
      }
      res.end(
        shell(
          '<h1>Northstar Orders</h1><p>Use any fictional credentials to sign in.</p><form method="post"><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label><button>Sign in</button></form>',
        ),
      );
      return;
    }
    if (url.pathname === "/api/token-orders") {
      if (req.headers.authorization !== "Bearer fixture-only-key") {
        res
          .writeHead(401)
          .end(JSON.stringify({ error: "Use the fictional fixture API key" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(records));
      return;
    }
    const session = req.headers.cookie?.match(
      /relay_fixture_session=([^;]+)/,
    )?.[1];
    if (!session || !sessions.has(session)) {
      res.writeHead(302, { Location: "/login" }).end();
      return;
    }
    if (url.pathname === "/report.xlsx") {
      res
        .writeHead(200, {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="orders.xlsx"',
        })
        .end(Buffer.from(bytes));
      return;
    }
    if (url.pathname === "/upload" && req.method === "POST") {
      let size = 0;
      for await (const chunk of req) size += chunk.length;
      res.end(
        shell(
          `<h1>Report received</h1><p id="confirmation">Report uploaded successfully (${size} bytes received).</p><a href="/orders">Back to orders</a>`,
        ),
      );
      return;
    }
    if (url.pathname === "/api/orders") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(records));
      return;
    }
    res.end(
      shell(
        `<h1>${url.searchParams.has("changed") ? "Order workspace — updated layout" : "Orders"}</h1><label>Search orders<input id="search" placeholder="Customer or order number"></label><pre id="records">${JSON.stringify(records, null, 2)}</pre><p><a href="/report.xlsx">Download report</a></p><form action="/upload" method="post" enctype="multipart/form-data"><label>Upload report<input type="file" name="report" accept=".xlsx"></label><button>Submit report</button></form><a href="/orders?changed=1">Try changed layout</a><script>const rows=${JSON.stringify(records)};document.querySelector('#search').oninput=e=>document.querySelector('#records').textContent=JSON.stringify(rows.filter(r=>JSON.stringify(r).toLowerCase().includes(e.target.value.toLowerCase())),null,2)</script>`,
      ),
    );
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return server;
}
if (process.argv[1]?.endsWith("fixture.ts")) {
  await fixture();
  console.log("Fixture: http://127.0.0.1:4318/login");
}
