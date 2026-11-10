import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";

const url = "http://127.0.0.1:3216/api/requests";
const send = async value => {
  const response = await fetch(url, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(value)});
  return {status:response.status, data:await response.json()};
};
const request = {key:randomUUID(),title:"Review the demo's source",category:"research"};
const first = await send(request);
assert.equal(first.status,201);
assert.equal(first.data.reused,false);
assert.equal(first.data.title,request.title);
const second = await send(request);
assert.equal(second.status,200);
assert.equal(second.data.reused,true);
assert.equal(second.data.id,first.data.id);
assert.equal(second.data.createdAt,first.data.createdAt);
assert.equal((await send({...request,title:"Different details"})).status,409);
assert.equal((await send({...request,key:randomUUID(),title:"x"})).status,422);

const concurrent = {...request,key:randomUUID()};
const attempts = await Promise.all(Array.from({length:8},()=>send(concurrent)));
assert.equal(attempts.filter(row=>row.status===201).length,1);
assert.equal(attempts.filter(row=>row.status===200).length,7);
assert.equal(new Set(attempts.map(row=>row.data.id)).size,1);

const contested = {...request,key:randomUUID()};
const variants = Array.from({length:8},(_,i)=>({...contested,title:i%2===0?"First possible request":"Second possible request"}));
const results = await Promise.all(variants.map(send));
const [winner] = results.filter(row=>row.status===201);
assert.ok(winner);
for (const [i, result] of results.entries()) {
  if (variants[i].title === winner.data.title) assert.equal(result.data.id,winner.data.id);
  else assert.equal(result.status,409);
}
assert.deepEqual(results.map(row=>row.status).sort(),[200,200,200,201,409,409,409,409]);
console.log("Passed validation, exact and changed retries, and eight concurrent identical and competing submissions.");
