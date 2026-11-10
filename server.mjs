import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {PGlite} from "@electric-sql/pglite";

const db = new PGlite(fileURLToPath(new URL("./.demo-db", import.meta.url)));
await db.exec(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
const page = await readFile(new URL("./index.html", import.meta.url));
const categories = new Set(["build", "repair", "research"]);
const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function send(response, status, value) {
  response.writeHead(status, {"Content-Type":"application/json", "Cache-Control":"no-store"});
  response.end(JSON.stringify(value));
}

async function save({key,title,category}) {
  // Keep INSERT and SELECT as separate statements so a concurrent retry sees the committed row.
  return db.transaction(async tx => {
    const {rows:[created]} = await tx.query(`
      insert into intake_requests(request_key,title,category) values ($1,$2,$3)
      on conflict (request_key) do nothing returning id,title,category,created_at as "createdAt"
    `, [key,title,category]);
    if (created) return {...created,created:true,matches:true};
    const {rows:[existing]} = await tx.query(`
      select id,title,category,created_at as "createdAt", title = $2 and category = $3 as matches
      from intake_requests where request_key = $1
    `, [key,title,category]);
    return {...existing,created:false};
  });
}

createServer(async (request,response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, {"Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store"});
    response.end(page);
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/requests") return send(response,404,{error:"Route unavailable."});
  if (request.headers["content-type"] !== "application/json") return send(response,415,{error:"Send a JSON request."});
  let value;
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of request.iterator({destroyOnReturn:false})) {
      length += chunk.length;
      if (length > 4096) return send(response,413,{error:"Keep the request under 4 KB."});
      chunks.push(chunk);
    }
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return send(response,400,{error:"Enter a valid JSON object."}); }
  const title = typeof value?.title === "string" ? value.title.trim() : "";
  if (!value || typeof value.key !== "string" || !keyPattern.test(value.key))
    return send(response,422,{error:"Start a new request to generate a valid request key."});
  if (title.length < 3 || title.length > 100 || /[\x00-\x1f\x7f]/.test(title))
    return send(response,422,{error:"Enter a title between 3 and 100 characters on one line."});
  if (!categories.has(value.category)) return send(response,422,{error:"Choose a category."});
  try {
    const {created,matches,...receipt} = await save({key:value.key,title,category:value.category});
    if (!matches) return send(response,409,{error:"This key belongs to different details. Restore them or start a new request."});
    return send(response,created?201:200,{...receipt,reused:!created});
  } catch { return send(response,503,{error:"The save could not be confirmed. Retry with the same key."}); }
}).listen(3216,"127.0.0.1",()=>console.log("Demo at http://localhost:3216"));
