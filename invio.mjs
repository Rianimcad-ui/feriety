// Invia al coordinatore la tabella del mese successivo, con PDF allegato (eseguito da GitHub Actions)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const { SUPABASE_URL: U, SUPABASE_SERVICE_KEY: K, BREVO_API_KEY: B, COORD_EMAIL: C, MITTENTE: M, FORCE, SCHED, TEST_EMAIL } = process.env;
const H = { apikey: K, Authorization: "Bearer " + K };
const q = async p => { const r = await fetch(U + "/rest/v1/" + p, { headers: H }); if (!r.ok) throw new Error(await r.text()); return r.json(); };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Negli altri giorni il lavoro serve solo a tenere attivo il database gratuito
if (FORCE !== "1" && SCHED !== "0 7 17 * *") { await q("profiles?select=id&limit=1"); console.log("Ping ok (mantiene attivo il database)"); process.exit(0); }

// ===== Regole turni (identiche a index.html) =====
const SH = ["M","P","N","S","R"], MAX = 3, TEAMS = ["A","B","C","D","E","MT"], ANCHOR = "2026-01-02";
const leap=y=>(y%4===0&&y%100!==0)||y%400===0;
const hc0={};
function hols(y){if(hc0[y])return hc0[y];const h={};const add=(m,d,n)=>h[m+"-"+d]=n;
add(0,1,"Capodanno");add(0,6,"Epifania");add(3,25,"Festa della Liberazione");add(4,1,"Festa del Lavoro");add(5,2,"Festa della Repubblica");
add(7,15,"Ferragosto");add(10,1,"Ognissanti");add(11,8,"Immacolata Concezione");add(11,25,"Natale");add(11,26,"Santo Stefano");
const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
hh=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-hh-k)%7,mm=Math.floor((a+11*hh+22*l)/451),
mo=Math.floor((hh+l-7*mm+114)/31),da=((hh+l-7*mm+114)%31)+1;
add(mo-1,da,"Pasqua");const p=new Date(Date.UTC(y,mo-1,da+1));add(p.getUTCMonth(),p.getUTCDate(),"Lunedì dell’Angelo");
return hc0[y]=h}
function shift(team,y,m,d){if(team==="MT")return"M";// squadra MT: solo Mattina, nessuna rotazione e nessuno slittamento dal 1° marzo
const[ay,am,ad]=ANCHOR.split("-").map(Number);
const n=Math.round((Date.UTC(y,m,d)-Date.UTC(ay,am-1,ad))/864e5);let x=0;const t0=Date.UTC(ay,am-1,ad),t1=Date.UTC(y,m,d);for(let yy=ay;yy<=y;yy++){const q=Date.UTC(yy,2,1);if(q>t0&&q<=t1&&!leap(yy))x++}return SH[(((n+x+TEAMS.indexOf(team))%5)+5)%5]}
const TC={A:"#1d4ed8",B:"#15803d",C:"#c2410c",D:"#7e22ce",E:"#be185d",MT:"#0f766e"};

const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const now = new Date(), t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
const y = t.getUTCFullYear(), m = t.getUTCMonth(), p2 = n => String(n).padStart(2, "0");
const a = `${y}-${p2(m + 1)}-01`, b = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
const profs = await q("profiles?select=*");
const tOf = new Map(profs.map(p => [p.id, p.team]));
let reqs = [], o = 0;
for (;;) { const r = await q(`requests?select=date,reason,user_id,team&date=gte.${a}&date=lte.${b}&order=date&limit=1000&offset=${o}`); reqs = reqs.concat(r); if (r.length < 1000) break; o += 1000; }
const oOf = new Map(profs.map(p => [p.id, !!p.oss]));
reqs.forEach(r => { r.team = r.team || tOf.get(r.user_id); r.oss = !!oOf.get(r.user_id); });
const emps = tm => profs.filter(p => p.team === tm).sort((x, z) => x.name.localeCompare(z.name));

// ===== Corpo dell'email (tabella di testo, come prima) =====
let html = `<h2>Richieste ferie e permessi - ${MESI[m]} ${y}</h2><p>In allegato il PDF con la griglia turno di tutte le squadre.</p>`, tot = 0;
for (const team of TEAMS) {
  const rows = emps(team).map(p => {
    const mine = reqs.filter(r => r.user_id === p.id); tot += mine.length;
    return mine.length ? `<tr><td>${esc(p.matricola)}</td><td>${esc(p.name)}${p.oss ? " (OSS)" : ""}</td><td>${mine.map(r => r.date.split("-").reverse().join("/") + " (" + esc(r.reason) + ")").join(", ")}</td></tr>` : "";
  }).join("");
  html += `<h3>Squadra ${team}</h3>` + (rows ? `<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Matricola</th><th>Nome</th><th>Giorni richiesti</th></tr>${rows}</table>` : "<p>Nessuna richiesta.</p>");
}

// ===== PDF: stesso aspetto dell'anteprima di stampa (A4 orizzontale, un foglio per squadra) =====
function buildPdf() {
  const { jsPDF } = require("jspdf");
  const AT = require("jspdf-autotable"), autoTable = AT.default || AT.autoTable || AT;
  const nd = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), Hd = hols(y), dn = ["D","L","M","M","G","V","S"];
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const rgb = h => [1,3,5].map(i => parseInt(h.slice(i, i + 2), 16)), tint = (c, k) => c.map(v => Math.round(255 - (255 - v) * k));
  const SC = { M:["#fde7a8","#6b4a00"], P:["#ffd2b0","#7a3300"], N:["#c9d0f7","#1f2a7a"], S:["#ecd0f4","#5a1d70"], R:["#cfeedb","#14532d"] };
  const WK = [247,234,233], RED = [180,35,24], WHITE = [255,255,255], BLACK = [0,0,0], W = 281, FC = 50;
  const days = [];
  for (let d = 1; d <= nd; d++) { const w = new Date(Date.UTC(y, m, d)).getUTCDay(); days.push({ d, k: `${y}-${p2(m + 1)}-${p2(d)}`, w, off: !!(Hd[m + "-" + d] || w === 0) }); }
  TEAMS.forEach((tm, idx) => {
    if (idx) doc.addPage();
    const E = emps(tm), tc = rgb(TC[tm]), mese = MESI[m][0].toUpperCase() + MESI[m].slice(1);
    doc.setFillColor(...tc); doc.rect(8, 8, W, 9, "F"); doc.setTextColor(255,255,255); doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text("Squadra " + tm + " · " + mese + " " + y + " · " + E.length + " dipendenti", 12, 14.3);
    const head = [[{ content: "Dipendente", styles: { halign: "left" } }, ...days.map(x => ({ content: dn[x.w] + "\n" + x.d, styles: { textColor: x.off ? RED : BLACK, fillColor: x.off ? WK : WHITE } }))]];
    const lt = tint(tc, .12), body = [];
    body.push([{ content: "Turno", styles: { halign: "left", fillColor: lt, textColor: [80,80,80] } }, ...days.map(x => { const sh = shift(tm, y, m, x.d); return { content: sh, styles: { fillColor: rgb(SC[sh][0]), textColor: rgb(SC[sh][1]), fontStyle: "bold" } }; })]);
    if (E.length) E.forEach(e => body.push([{ content: e.name + "  " + (e.matricola ?? "") + (e.oss ? "  OSS" : ""), styles: { halign: "left", fillColor: lt } }, ...days.map(x => {
      const r = reqs.find(q2 => q2.date === x.k && q2.user_id === e.id);
      return r ? { content: String(r.reason || "?")[0], styles: { fillColor: tc, textColor: WHITE, fontStyle: "bold" } } : { content: "", styles: { fillColor: x.off ? WK : WHITE } };
    })]));
    else body.push([{ content: "Nessun dipendente registrato", colSpan: nd + 1, styles: { halign: "left", fillColor: lt, textColor: [80,80,80] } }]);
    [["Infermieri", false], ["OSS", true]].forEach(([lb, o]) => body.push([{ content: lb + " (max " + MAX + ")", styles: { halign: "left", fontStyle: "bold", fillColor: lt } }, ...days.map(x => { const n = reqs.filter(r => r.date === x.k && r.team === tm && r.oss === o).length;
      return { content: n ? String(n) : "", styles: { fillColor: x.off ? WK : WHITE, textColor: n >= MAX ? RED : BLACK, fontStyle: n >= MAX ? "bold" : "normal" } }; })]));
    const cs = { 0: { cellWidth: FC, halign: "left", cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 1 } } };
    for (let i = 1; i <= nd; i++) cs[i] = { cellWidth: (W - FC) / nd };
    autoTable(doc, { head, body, startY: 19, margin: { left: 8, right: 8, top: 8, bottom: 8 }, tableWidth: W, theme: "grid", columnStyles: cs,
      styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 1.6, bottom: 1.6, left: 0, right: 0 }, halign: "center", valign: "middle", lineColor: [153,153,153], lineWidth: .2, textColor: BLACK, overflow: "ellipsize" },
      headStyles: { fillColor: WHITE, textColor: BLACK, fontStyle: "bold", fontSize: 7.5 } });
  });
  return Buffer.from(doc.output("arraybuffer")).toString("base64");
}

// Se la creazione del PDF fallisce, l'email parte comunque (con la tabella nel testo)
let pdf = null;
try { pdf = buildPdf(); console.log("PDF creato"); } catch (e) { console.error("PDF non creato:", e); html = "<p><b>Attenzione:</b> il PDF non è stato generato, trovi la tabella qui sotto.</p>" + html; }

const to = (TEST_EMAIL || C || "").trim();
const mail = { sender: { name: "Ferie reparto", email: M }, to: [{ email: to }], subject: `Richieste ferie ${MESI[m]} ${y} (${tot} giorni)`, htmlContent: html };
if (pdf) mail.attachment = [{ name: `Richieste_ferie_${MESI[m]}_${y}.pdf`, content: pdf }];
const res = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": B, "content-type": "application/json" }, body: JSON.stringify(mail) });
if (!res.ok) { console.error(await res.text()); process.exit(1); }
console.log("Email inviata a " + (TEST_EMAIL ? "indirizzo di prova" : "coordinatore") + (pdf ? " con PDF allegato" : " (senza PDF)"));
