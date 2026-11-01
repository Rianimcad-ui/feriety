// Invia al coordinatore la tabella del mese successivo (eseguito da GitHub Actions)
const { SUPABASE_URL: U, SUPABASE_SERVICE_KEY: K, BREVO_API_KEY: B, COORD_EMAIL: C, MITTENTE: M, FORCE, SCHED } = process.env;
const H = { apikey: K, Authorization: "Bearer " + K };
const q = async p => { const r = await fetch(U + "/rest/v1/" + p, { headers: H }); if (!r.ok) throw new Error(await r.text()); return r.json(); };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

if (FORCE !== "1" && SCHED !== "0 7 17 * *") { await q("profiles?select=id&limit=1"); console.log("Ping ok (mantiene attivo il database)"); process.exit(0); }

const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const now = new Date(), t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
const y = t.getUTCFullYear(), m = t.getUTCMonth(), p2 = n => String(n).padStart(2, "0");
const a = `${y}-${p2(m + 1)}-01`, b = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

const profs = await q("profiles?select=id,name,matricola,team");
let reqs = [], o = 0;
for (;;) { const r = await q(`requests?select=date,reason,user_id&date=gte.${a}&date=lte.${b}&order=date&limit=1000&offset=${o}`); reqs = reqs.concat(r); if (r.length < 1000) break; o += 1000; }

let html = `<h2>Richieste ferie e permessi - ${MESI[m]} ${y}</h2>`, tot = 0;
for (const team of ["A","B","C","D","E"]) {
  const rows = profs.filter(p => p.team === team).sort((x, z) => x.name.localeCompare(z.name)).map(p => {
    const mine = reqs.filter(r => r.user_id === p.id); tot += mine.length;
    return mine.length ? `<tr><td>${esc(p.matricola)}</td><td>${esc(p.name)}</td><td>${mine.map(r => r.date.split("-").reverse().join("/") + " (" + esc(r.reason) + ")").join(", ")}</td></tr>` : "";
  }).join("");
  html += `<h3>Squadra ${team}</h3>` + (rows ? `<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Matricola</th><th>Nome</th><th>Giorni richiesti</th></tr>${rows}</table>` : "<p>Nessuna richiesta.</p>");
}
const res = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST", headers: { "api-key": B, "content-type": "application/json" },
  body: JSON.stringify({ sender: { name: "Ferie reparto", email: M }, to: [{ email: C }], subject: `Richieste ferie ${MESI[m]} ${y} (${tot} giorni)`, htmlContent: html })
});
if (!res.ok) { console.error(await res.text()); process.exit(1); }
console.log("Email inviata al coordinatore");
