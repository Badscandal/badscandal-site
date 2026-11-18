/* Profile masters (18 Nov 2026). Luke uploads one profile photo and one banner from /hq.
   The bytes live in the staff blob store (profile-img/<key>.json), behind the same login as the desk.
   They are not public. A copy is stored for a platform only when the master already has that shape
   and is at least the prepare size: it is scaled down, never up, and never cropped.
   A different shape becomes a job. Atlas (the music stores), Laura (YouTube) and Kevin (TikTok)
   extend or pad it, then upload the result here. HQ never logs in and never sends a file to a platform.

   A problem (too small, a rework that fails the check, a platform that rejected it, a job open more
   than a day) is one decision for Luke, in plain words. The same problem is not asked twice. */
import {
  PROFILE_SLOTS, StaffError, clean, cleanText, getProfiles, httpsLink, isOpen, listMessages, mutate,
  noSecrets, pictureOf, profileGroup, profilePlan, profileSpec, sendMessage, whoIs,
} from "./staff.mjs";

const MAX = 4 * 1024 * 1024;
const FILE = (key) => `profile-img/${key}.json`;
const PUBLIC = (key) => `https://badscandal.com/api/staff/profile-file/${key}`;
const TYPE = { jpg: "image/jpeg", png: "image/png" };
const DAY = 24 * 60 * 60 * 1000;

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
function asDoc(doc) {
  doc.slots = bag(doc.slots);
  doc.masters = bag(doc.masters);
  doc.versions = bag(doc.versions);
  doc.uploaded = bag(doc.uploaded);
  doc.rejected = bag(doc.rejected);
  doc.asks = bag(doc.asks);
  doc.jobs = Array.isArray(doc.jobs) ? doc.jobs : [];
  return doc;
}
function changeProfiles(store, fn) {
  return mutate(store, "profiles.json", {}, (doc) => {
    const fresh = !doc || typeof doc !== "object" || Array.isArray(doc);
    const base = fresh ? {} : doc;
    asDoc(base);
    const value = fn(base);
    if (value && value.skip) return { skip: true, value: value.value };
    return fresh ? { replace: base, value } : { value };
  });
}
function slotById(id) {
  const slot = PROFILE_SLOTS.find((s) => s.id === String(id || ""));
  if (!slot) throw new StaffError("That profile image is not on the list. Nothing was saved.");
  return slot;
}
function mayTouch(by, slot) {
  if (by === "Luke" || by === "Claude" || by === "Nova" || (slot.owner && by === slot.owner)) return;
  if (!slot.owner) throw new StaffError(`${slot.platform} has no owner yet. Luke uploads it himself. Tell him, or ask Nova. Nothing was saved.`, "not_allowed");
  throw new StaffError(`${slot.platform}'s ${slot.kind.toLowerCase()} is ${slot.owner}'s. Tell ${slot.owner}. Nothing was saved.`, "not_allowed");
}
function bufOf(b64) {
  const raw = String(b64 || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!raw) throw new StaffError("Send the picture in image_base64. Nothing was saved.");
  if (raw.length > Math.ceil(MAX / 3) * 4 + 8) throw new StaffError("The picture is over 4 MB. Nothing was saved.");
  const buf = Buffer.from(raw, "base64");
  if (!buf.length || buf.length > MAX) throw new StaffError("The picture is over 4 MB. Nothing was saved.");
  return buf;
}
function readPic(buf) {
  const pic = pictureOf(buf);
  if (!pic || pic.ext === "webp" || pic.w == null || pic.h == null || !(pic.w > 0) || !(pic.h > 0)) throw new StaffError("That file needs to be a JPG or PNG whose size can be read. Nothing was saved.");
  if (pic.ext !== "jpg" && pic.ext !== "png") throw new StaffError("Send a JPG or PNG. Nothing was saved.");
  return pic;
}
async function putFile(store, key, buf, ext) {
  await store.setJSON(FILE(key), { type: TYPE[ext] || "image/jpeg", b64: buf.toString("base64") });
}
function slotsOf(group) {
  return PROFILE_SLOTS.filter((s) => profileGroup(s) === group);
}
function jobNote(slot, spec) {
  const size = spec.exact ? `${spec.exact[0]} x ${spec.exact[1]}` : "the right shape";
  if (slot.owner && slot.owner !== "Luke") return `${slot.owner} can extend the canvas or pad it to ${size}. Nothing is cropped.`;
  return `Luke uploads a fitting master, or Nova may extend the canvas to ${size}. Nothing is cropped.`;
}

/* one decision for Luke. The same key + token is not asked again. */
async function askLuke(store, now, roster, key, token, text, options, about) {
  const cur = await getProfiles(store);
  if (cur.asks && cur.asks[key] && cur.asks[key].token === token) return null;
  const open = (await listMessages(store, now, 2)).find((m) => m && m.mailId === "profile-" + key && isOpen(m));
  if (open) return null;
  let msg;
  try {
    msg = await sendMessage(store, now, roster, { from: "HQ", to: "Luke", needs: "decision", text, options, mailId: "profile-" + key, ...(about ? { about } : {}) });
  } catch { return null; }
  await changeProfiles(store, (doc) => {
    if (doc.asks[key] && doc.asks[key].token === token) return { skip: true, value: null };
    doc.asks[key] = { token, at: new Date(now).toISOString(), id: msg.message.id };
    return { id: msg.message.id };
  });
  return msg.message;
}

export async function saveProfileMaster(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (by !== "Luke") throw new StaffError("Only Luke uploads a master from the page. Nothing was saved.", "not_allowed");
  const group = a.kind === "photo" || a.kind === "banner" ? a.kind : "";
  if (!group) throw new StaffError("kind must be photo or banner. Nothing was saved.");
  const buf = bufOf(a.image_base64);
  const pic = readPic(buf);
  const at = new Date(now).toISOString();
  const small = [];
  const plans = [];
  const cleared = [];
  await putFile(store, "master-" + group, buf, pic.ext);
  await changeProfiles(store, (doc) => {
    small.length = 0; plans.length = 0; cleared.length = 0;
    doc.masters[group] = { w: pic.w, h: pic.h, bytes: buf.length, format: pic.ext, at, by };
    doc.jobs = doc.jobs.filter((j) => { const s = PROFILE_SLOTS.find((x) => x.id === j.slot); return s && profileGroup(s) !== group; });
    for (const slot of slotsOf(group)) {
      if (doc.versions[slot.id]) cleared.push(slot.id);
      delete doc.versions[slot.id];
      delete doc.uploaded[slot.id];
      delete doc.rejected[slot.id];
      const spec = profileSpec(slot);
      const plan = profilePlan(pic.w, pic.h, spec);
      plans.push({ id: slot.id, platform: slot.platform, kind: slot.kind, fit: plan.fit, out: plan.out, reason: plan.reason, mb: spec.mb, formats: spec.formats });
      if (plan.problem === "ratio") doc.jobs.push({ id: "job-" + slot.id, slot: slot.id, status: "open", reason: plan.reason, note: jobNote(slot, spec), at, by, owner: slot.owner || "" });
      if (plan.problem === "small" || plan.alsoSmall) small.push({ slot, spec });
    }
    return { ok: true };
  });
  for (const id of cleared) { try { await store.delete(FILE("slot-" + id)); } catch { /* the old copy is unused */ } }
  if (small.length) {
    const what = group === "photo" ? "profile photo" : "banner";
    const bits = small.map(({ slot, spec }) => `${slot.platform} (${spec.exact[0]} x ${spec.exact[1]})`);
    const text = `The ${what} you uploaded is ${pic.w} x ${pic.h}. These need a bigger one, and it was not scaled up: ${bits.join(", ")}. Upload a bigger one, or leave these until you do.`;
    await askLuke(store, now, roster, "small-" + group, `${pic.w}x${pic.h}`, text, ["I'll upload a bigger one", "Leave it"]);
  }
  return { kind: group, width: pic.w, height: pic.h, bytes: buf.length, slots: plans, note: "Saved. HQ did not log in and did not send this to a platform." };
}

function limitOf(spec) {
  const mb = spec.mb || 4;
  return Math.min(mb, 4) * 1024 * 1024;
}
function formatOk(spec, ext) {
  return spec.formats.includes(ext) || (ext === "jpg" && spec.formats.includes("jpeg"));
}

export async function saveProfileVersion(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  const slot = slotById(clean(a.slot, 40));
  const source = a.source === "rework" ? "rework" : "resized";
  if (source === "resized" && by !== "Luke") throw new StaffError("Only Luke's page stores a sized copy. Nothing was saved.", "not_allowed");
  if (source === "rework") mayTouch(by, slot);
  const buf = bufOf(a.image_base64);
  const pic = readPic(buf);
  const spec = profileSpec(slot);
  const doc = await getProfiles(store);
  const master = doc.masters && doc.masters[spec.group];
  if (!master || !master.w) throw new StaffError("There is no master yet. Luke uploads it on Profiles. Nothing was saved.");
  const plan = profilePlan(master.w, master.h, spec);
  if (source === "resized" && !plan.fit) throw new StaffError("This shape does not fit. Nothing was cropped. Nothing was saved.");
  const exact = spec.exact;
  const over = buf.length > limitOf(spec);
  const wrongSize = !exact || pic.w !== exact[0] || pic.h !== exact[1];
  const badType = !formatOk(spec, pic.ext);
  if (wrongSize || over || badType) {
    const why = badType ? `It needs to be a JPG or PNG.` : over ? `It is over ${spec.mb || 4} MB.` : `It is ${pic.w} x ${pic.h}. It needs to be exactly ${exact[0]} x ${exact[1]}.`;
    if (source === "rework") {
      const who = slot.owner && slot.owner !== "Luke" ? slot.owner : "";
      await askLuke(store, now, roster, "bad-" + slot.id, `${pic.w}x${pic.h}:${pic.ext}:${buf.length}`,
        `${slot.platform} ${slot.kind}: the reworked file ${why} It was not saved, and nothing was sent to the platform.`,
        ["Send it back", "I'll upload a new master"], who);
    }
    throw new StaffError(`${slot.platform} ${slot.kind}: ${why} Nothing was saved.`);
  }
  await putFile(store, "slot-" + slot.id, buf, pic.ext);
  const at = new Date(now).toISOString();
  await changeProfiles(store, (d) => {
    d.versions[slot.id] = { w: pic.w, h: pic.h, bytes: buf.length, format: pic.ext, at, by, source };
    delete d.rejected[slot.id];
    d.jobs = d.jobs.map((j) => (j.slot === slot.id && j.status === "open" ? { ...j, status: "done", doneAt: at, by } : j));
    return { saved: true };
  });
  return { saved: true, slot: slot.id, platform: slot.platform, kind: slot.kind, width: pic.w, height: pic.h, status: "ready", note: "Stored. HQ did not log in and did not send this to a platform." };
}

function jobOut(doc, j) {
  const slot = PROFILE_SLOTS.find((s) => s.id === j.slot);
  if (!slot) return null;
  const spec = profileSpec(slot);
  const master = doc.masters && doc.masters[spec.group];
  return { id: j.id, slot: slot.id, platform: slot.platform, kind: slot.kind, owner: slot.owner || "Luke", reason: j.reason || "", note: j.note || "",
    exact: spec.exact, formats: spec.formats, mb: spec.mb, rule: spec.rule, circle: spec.circle,
    master: master && master.w ? { width: master.w, height: master.h, format: master.format || "", url: PUBLIC("master-" + spec.group) } : null,
    how: "Extend the canvas or pad it to the exact size. Do not crop the subject away. Do not scale the picture up. Upload that file with profile_rework. Then put it on the platform yourself and mark it with profile_uploaded and an https link. HQ never logs in and never sends the file to a platform." };
}
function visibleJob(by, slot) {
  if (by === "Luke" || by === "Claude" || by === "Nova") return true;
  return !!(slot && slot.owner && slot.owner === by);
}

export async function listProfileJobs(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  await profileAlerts(store, now, roster);
  const doc = await getProfiles(store);
  const jobs = (doc.jobs || []).filter((j) => j && j.status === "open").map((j) => ({ j, slot: PROFILE_SLOTS.find((s) => s.id === j.slot) })).filter((x) => x.slot && visibleJob(by, x.slot));
  return { jobs: jobs.map((x) => jobOut(doc, x.j)).filter(Boolean),
    note: jobs.length ? "Nothing here has been sent to a platform. HQ never logs in." : "No profile image is waiting on you." };
}

export async function profileMasterFile(store, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  let group = a.kind === "photo" || a.kind === "banner" ? a.kind : "";
  let slot = null;
  if (a.slot) { slot = slotById(clean(a.slot, 40)); mayTouch(by, slot); group = profileGroup(slot); }
  else if (!group) throw new StaffError("Say kind photo or banner, or a slot id from profile_jobs. Nothing was returned.");
  else if (by !== "Luke" && by !== "Claude" && by !== "Nova" && !PROFILE_SLOTS.some((s) => profileGroup(s) === group && s.owner === by)) throw new StaffError("That master is not yours. Nothing was returned.", "not_allowed");
  const doc = await getProfiles(store);
  const m = doc.masters && doc.masters[group];
  if (!m || !m.w) return { ready: false, kind: group, note: "No master yet. Luke uploads it on Profiles." };
  const spec = slot ? profileSpec(slot) : null;
  return { ready: true, kind: group, width: m.w, height: m.h, format: m.format || "", bytes: m.bytes || 0, url: PUBLIC("master-" + group),
    ...(spec ? { slot: slot.id, platform: slot.platform, image: slot.kind, exact: spec.exact, formats: spec.formats, mb: spec.mb, rule: spec.rule } : {}),
    how: "Open the url with the same Authorization header you use for the connector. It is not a public link. HQ never logs in and never sends this file to a platform." };
}

export async function markProfileUploaded(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  const slot = slotById(clean(a.slot, 40));
  mayTouch(by, slot);
  const rejected = a.rejected === true || String(a.rejected || "").trim().toLowerCase() === "yes";
  const at = new Date(now).toISOString();
  if (rejected) {
    const note = cleanText(a.note, 300);
    if (note.length < 2) throw new StaffError("Say what the platform said, in note. Nothing was saved.");
    noSecrets(note);
    await changeProfiles(store, (doc) => {
      doc.rejected[slot.id] = { note, by, at };
      return { saved: true };
    });
    const who = slot.owner && slot.owner !== "Luke" ? slot.owner : "";
    await askLuke(store, now, roster, "rejected-" + slot.id, at,
      `${by} says ${slot.platform} rejected the ${slot.kind.toLowerCase()}: ${note} The picture on the platform was not changed from here.`,
      ["Make another version", "Leave the current one"], who);
    return { saved: true, rejected: true, slot: slot.id, note: "Recorded. HQ did not change the platform." };
  }
  const link = httpsLink(a.link);
  if (!link) throw new StaffError("link must be an https link that shows the upload. Nothing was saved.");
  noSecrets(link);
  await changeProfiles(store, (doc) => {
    doc.uploaded[slot.id] = { link, by, at };
    delete doc.rejected[slot.id];
    doc.jobs = doc.jobs.map((j) => (j.slot === slot.id && j.status === "open" ? { ...j, status: "done", doneAt: at, by } : j));
    return { saved: true };
  });
  return { saved: true, slot: slot.id, platform: slot.platform, kind: slot.kind, link, status: "uploaded", by, note: "Recorded as uploaded by you. HQ did not log in and did not change the platform." };
}

export async function profileAlerts(store, now, roster) {
  const doc = await getProfiles(store);
  const stuck = (Array.isArray(doc.jobs) ? doc.jobs : []).filter((j) => j && j.status === "open" && j.at && now - Date.parse(j.at) > DAY);
  if (!stuck.length) return { asked: false };
  const token = stuck.map((j) => j.id + "@" + j.at).sort().join("|");
  if (doc.asks && doc.asks.stuck && doc.asks.stuck.token === token) return { asked: false };
  const lines = stuck.map((j) => {
    const slot = PROFILE_SLOTS.find((s) => s.id === j.slot);
    const who = (slot && slot.owner) || "Luke";
    return slot ? `${slot.platform} ${slot.kind.toLowerCase()} (waiting on ${who})` : j.slot;
  });
  const text = `A profile image has been waiting more than a day, and nothing was sent to the platform: ${lines.join("; ")}.`;
  const msg = await askLuke(store, now, roster, "stuck", token, text, ["Chase them", "I'll handle it"]);
  return { asked: !!msg };
}

export async function profileFileResponse(store, name) {
  const key = String(name || "").split("?")[0].replace(/\/+$/, "");
  const nf = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain", "cache-control": "no-store" } });
  if (!/^(master-photo|master-banner|slot-[a-z0-9-]{1,40})$/.test(key)) return nf();
  if (key.startsWith("slot-") && !PROFILE_SLOTS.some((s) => s.id === key.slice(5))) return nf();
  let doc = null;
  try { doc = await store.get(FILE(key), { type: "json" }); } catch { doc = null; }
  if (!doc || !doc.b64) return nf();
  const type = doc.type === "image/png" ? "image/png" : "image/jpeg";
  return new Response(Buffer.from(doc.b64, "base64"), { status: 200, headers: { "content-type": type, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'", "x-robots-tag": "noindex, nofollow" } });
}
