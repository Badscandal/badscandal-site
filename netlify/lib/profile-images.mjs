/* Profile masters (18 Nov 2026). Luke uploads one profile photo and one banner from /hq.
   The bytes live in the staff blob store (profile-img/<key>.json), behind the same login as the desk.
   They are not public. A copy is stored for a platform only when the master already has that shape
   and is at least the prepare size: it is scaled down, never up, and never cropped.
   A different shape becomes a job. Atlas (the music stores), Laura (YouTube) and Kevin (TikTok)
   extend or pad it, then upload the result here. HQ never logs in and never sends a file to a platform.

   A problem (too small, a rework that fails the check, a platform that rejected it, a job open more
   than a day) is one decision for Luke, in plain words. The same problem is not asked twice. */
import {
  PROFILE_RESULTS, PROFILE_SLOTS, StaffError, clean, cleanText, getProfiles, httpsLink, isOpen, listMessages, mutate,
  noSecrets, pictureOf, profileCheck, profileGroup, profilePlan, profileSpec, resolveMessage, sendMessage, whoIs,
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
  doc.checks = bag(doc.checks); /* 24 Nov 2026: a bot's check of the public profile, per slot */
  doc.retry = bag(doc.retry); /* 24 Nov 2026: Luke's "Try again", per slot */
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
/* 21 Nov 2026 (Luke): "any issue with specs they generate a new AI image to make it fit correctly but exactly like
   mine". The bot makes it from Luke's master with an image model; HQ only stores it at the exact size. */
function jobNote(slot, spec) {
  const size = spec.exact ? `${spec.exact[0]} x ${spec.exact[1]}` : "the right shape";
  const who = slot.owner && slot.owner !== "Luke" ? slot.owner : "Nova";
  return `${who} makes an AI version at ${size} that looks exactly like Luke's: the same picture, nothing cropped or changed.`;
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
  const plans = [];
  const cleared = [];
  await putFile(store, "master-" + group, buf, pic.ext);
  await changeProfiles(store, (doc) => {
    plans.length = 0; cleared.length = 0;
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
      /* a different shape OR too small: the slot's bot makes an AI version (21 Nov 2026: no "upload a bigger one" ask) */
      if (plan.problem === "ratio" || plan.problem === "small" || plan.alsoSmall) doc.jobs.push({ id: "job-" + slot.id, slot: slot.id, status: "open", problem: plan.problem === "ratio" ? "shape" : "small", reason: plan.reason, note: jobNote(slot, spec), at, by, owner: slot.owner || "" });
    }
    return { ok: true };
  });
  for (const id of cleared) { try { await store.delete(FILE("slot-" + id)); } catch { /* the old copy is unused */ } }
  const told = await tellOwners(store, now, roster, group, at);
  return { kind: group, width: pic.w, height: pic.h, bytes: buf.length, slots: plans, told, note: "Saved. HQ did not log in and did not send this to a platform." };
}

/* 24 Nov 2026, Luke: "immediately after luke submits an upload, upload it to each respected profile and then change
   the profile ring to green". ONE desk message from HQ to each owner bot of that group, once per upload (mailId).
   Luke's own (Instagram) and the slots with no owner (X) get none. An older upload's note to that bot is closed. */
const andList = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
const ownerBot = (slot) => (slot.owner && slot.owner !== "Luke" ? slot.owner : "");
export const PROFILE_STEPS = "open the public profile, take a screenshot and record it with profile_uploaded (result live + screenshot_base64). Can't log in: result login with what happened, then sort it out with Luke in your chat; once it works, upload, check and record live.";
async function tellOwners(store, now, roster, group, at) {
  const mailId = `profile-upload-${group}-${at}`;
  const bots = [...new Set(slotsOf(group).map(ownerBot).filter(Boolean))];
  let msgs = [];
  try { msgs = await listMessages(store, now, 2); } catch { msgs = []; }
  const told = [];
  for (const bot of bots) {
    const mine = slotsOf(group).filter((s) => s.owner === bot);
    for (const old of msgs.filter((m) => m && m.to === bot && isOpen(m) && String(m.mailId || "").startsWith(`profile-upload-${group}-`) && m.mailId !== mailId)) {
      try { await resolveMessage(store, now, roster, { id: old.id, by: "HQ", note: "Luke uploaded a newer one." }); } catch { /* best effort */ }
    }
    if (msgs.some((m) => m && m.to === bot && m.mailId === mailId)) continue;
    const what = group === "banner" ? "banner" : "profile photo";
    const text = `Luke uploaded a new ${what}. Now: log in to ${andList([...new Set(mine.map((s) => s.platform))])}, put it up (use the sized copy from profile_master, or the AI version once your job is done), ${PROFILE_STEPS} Slots: ${mine.map((s) => s.id).join(", ")}.`;
    try { await sendMessage(store, now, roster, { from: "HQ", to: bot, needs: "action", text, mailId }); told.push(bot); } catch { /* a full board never fails the upload */ }
  }
  return told;
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
    kind: "rework",
    how: "Extend the canvas or pad it to the exact size. Do not crop the subject away. Do not scale the picture up. Upload that file with profile_rework. Then put it on the platform yourself, " + PROFILE_STEPS + " HQ never logs in and never sends the file to a platform." };
}
function visibleJob(by, slot) {
  if (by === "Luke" || by === "Claude" || by === "Nova") return true;
  return !!(slot && slot.owner && slot.owner === by);
}

export async function listProfileJobs(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  /* a list only: the hourly job and the board ask Luke about a stuck job (18 Nov 2026, handoff bug 5) */
  const doc = await getProfiles(store);
  const jobs = (doc.jobs || []).filter((j) => j && j.status === "open").map((j) => ({ j, slot: PROFILE_SLOTS.find((s) => s.id === j.slot) })).filter((x) => x.slot && visibleJob(by, x.slot));
  const out = jobs.map((x) => jobOut(doc, x.j)).filter(Boolean);
  /* 24 Nov 2026: every image of yours with Luke's upload but no live check since it (kind upload), and Luke's
     "Try again" (kind retry). An image whose AI version is still being made is the rework job above. */
  for (const slot of PROFILE_SLOTS) {
    if (!ownerBot(slot) || !visibleJob(by, slot)) continue;
    const c = profileCheck(doc, slot);
    if (!c.master || (c.has && !c.retryAt)) continue;
    if (!c.retryAt && jobs.some((x) => x.slot.id === slot.id)) continue;
    const spec = profileSpec(slot);
    const copy = doc.versions && doc.versions[slot.id] && doc.versions[slot.id].w ? PUBLIC("slot-" + slot.id) : "";
    out.push({ kind: c.retryAt ? "retry" : "upload", slot: slot.id, platform: slot.platform, image: slot.kind, owner: slot.owner,
      exact: spec.exact, master: { width: c.master.w, height: c.master.h, url: PUBLIC("master-" + spec.group) }, ...(copy ? { copy_url: copy } : {}),
      last_check: c.check ? { result: c.check.result, note: c.check.note, by: c.check.by, at: c.check.at } : null,
      ...(c.retryAt ? { luke_asked_again: c.retryAt } : {}),
      how: `Log in to ${slot.platform}, put up Luke's ${spec.group === "banner" ? "banner" : "photo"}, ` + PROFILE_STEPS });
  }
  return { jobs: out,
    note: out.length ? "Nothing here has been sent to a platform. HQ never logs in: you do." : "No profile image is waiting on you." };
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
    ...(slot && doc.versions && doc.versions[slot.id] && doc.versions[slot.id].w ? { copy_url: PUBLIC("slot-" + slot.id) } : {}),
    how: "Open the url with the same Authorization header you use for the connector. It is not a public link. HQ never logs in and never sends this file to a platform." };
}

/* profile_uploaded. 24 Nov 2026 (Luke): the bot checks the REAL public profile after it uploads, and records what it
   saw: result live (it shows Luke's current upload), not_mine (another image: a screenshot is required), login (it
   could not log in) or failed (the upload did not work). Every result asks for a screenshot of the image as the
   profile shows it now. The new results send NO message to Luke ("if there's an issue it should only show in the
   HQ"): he sorts it out with the bot in its own chat. The old rejected: true path is kept as it was. */
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
      delete doc.retry[slot.id];
      return { saved: true };
    });
    const who = slot.owner && slot.owner !== "Luke" ? slot.owner : "";
    await askLuke(store, now, roster, "rejected-" + slot.id, at,
      `${by} says ${slot.platform} rejected the ${slot.kind.toLowerCase()}: ${note} The picture on the platform was not changed from here.`,
      ["Make another version", "Leave the current one"], who);
    await settleMail(store, now, roster, slot);
    return { saved: true, rejected: true, slot: slot.id, note: "Recorded. HQ did not change the platform." };
  }
  const result = a.result == null || String(a.result).trim() === "" ? "live" : String(a.result).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!PROFILE_RESULTS.includes(result)) throw new StaffError("result must be live, not_mine, login or failed. Nothing was saved.");
  const note = cleanText(a.note, 300);
  if ((result === "login" || result === "failed") && note.length < 2) throw new StaffError(result === "login" ? "Say what happened when you tried to log in, in note (never a password or a code). Nothing was saved." : "Say what went wrong with the upload, in note. Nothing was saved.");
  if (note) noSecrets(note);
  const pageRaw = a.page == null ? "" : String(a.page).trim();
  const page = pageRaw ? httpsLink(pageRaw) : "";
  if (pageRaw && !page) throw new StaffError("page must be the https link to the public profile. Nothing was saved.");
  const linkRaw = a.link == null ? "" : String(a.link).trim();
  const link = linkRaw ? httpsLink(linkRaw) : "";
  if (linkRaw && !link) throw new StaffError("link must be an https link that shows the upload. Nothing was saved.");
  if (page) noSecrets(page);
  if (link) noSecrets(link);
  if (result === "live" && !link && !page) throw new StaffError("Give page: the https link to the public profile that now shows Luke's upload. Nothing was saved.");
  const hasShot = a.screenshot_base64 != null && String(a.screenshot_base64).trim() !== "";
  if (result === "not_mine" && !hasShot) throw new StaffError("not_mine needs screenshot_base64: a JPG or PNG screenshot of the image the profile shows now. Nothing was saved.");
  let shot = null;
  if (hasShot) {
    shot = bufOf(a.screenshot_base64);
    const pic = readPic(shot);
    await putFile(store, "shot-" + slot.id, shot, pic.ext);
  }
  await changeProfiles(store, (doc) => {
    doc.checks[slot.id] = { result, note, by, at, page: page || (result === "live" ? link : ""), shot: !!shot };
    delete doc.retry[slot.id];
    if (result === "live") {
      doc.uploaded[slot.id] = { link: link || page, by, at };
      delete doc.rejected[slot.id];
      doc.jobs = doc.jobs.map((j) => (j.slot === slot.id && j.status === "open" ? { ...j, status: "done", doneAt: at, by } : j));
    }
    return { saved: true };
  });
  if (!shot) { try { await store.delete(FILE("shot-" + slot.id)); } catch { /* there was none */ } }
  await settleMail(store, now, roster, slot);
  const said = { live: "Recorded: the profile shows Luke's upload. The ring turns green.",
    not_mine: "Recorded: the profile shows another image. Luke sees your screenshot on HQ. Upload his and record live.",
    login: "Recorded: you could not log in. The ring is yellow with your name. Sort the login out with Luke in your chat; once it works, upload, check and record live.",
    failed: "Recorded: the upload did not work. Try again, then record what the profile shows." }[result];
  return { saved: true, slot: slot.id, platform: slot.platform, kind: slot.kind, result, by, screenshot: !!shot, ...(page ? { page } : {}), ...(link ? { link } : {}),
    status: result === "live" ? "uploaded" : result, note: said + " HQ did not log in and did not change the platform." };
}

/* close the notes that asked for this: Luke's "Try again" once none of that platform's images waits on it, and the
   upload note once every image of that group of the owner's is live. Best effort: a refusal never fails the check. */
async function settleMail(store, now, roster, slot) {
  const bot = ownerBot(slot);
  if (!bot) return;
  try {
    const doc = await getProfiles(store);
    const msgs = (await listMessages(store, now, 2)).filter((m) => m && m.to === bot && isOpen(m));
    const plat = PROFILE_SLOTS.filter((s) => s.platformId === slot.platformId);
    const retry = msgs.find((m) => m.mailId === "profile-retry-" + slot.platformId);
    if (retry && !plat.some((s) => profileCheck(doc, s).retryAt)) await resolveMessage(store, now, roster, { id: retry.id, by: bot, note: "Checked again on HQ." });
    const group = profileGroup(slot);
    const m = doc.masters && doc.masters[group];
    const up = m && m.at ? msgs.find((x) => x.mailId === `profile-upload-${group}-${m.at}`) : null;
    if (up && slotsOf(group).filter((s) => s.owner === bot).every((s) => profileCheck(doc, s).has)) await resolveMessage(store, now, roster, { id: up.id, by: bot, note: "Live on every profile." });
  } catch { /* best effort */ }
}

/* 24 Nov 2026, Luke: "give me an option to try again, which will go straight to the bot, or hang somewhere for when
   the bot checks again". Luke only. Marks that platform's images that do not have his upload, and sends ONE message
   from Luke to the owner (not while the last one is still open). profile_jobs lists them as kind retry. */
export async function retryProfile(store, now, roster, a) {
  const by = whoIs(a.by, roster, { people: true });
  if (by !== "Luke") throw new StaffError("Only Luke asks a bot to try again. Nothing was sent.", "not_allowed");
  const want = String(a.platform || "").trim().toLowerCase();
  const slots = PROFILE_SLOTS.filter((s) => s.platformId === want || s.platform.toLowerCase() === want);
  if (!slots.length) throw new StaffError("That platform is not on the list. Nothing was sent.");
  const platform = slots[0].platform, pid = slots[0].platformId;
  if (!slots[0].owner) throw new StaffError(`${platform} has no bot yet. Upload it yourself, or ask Nova who should take it. Nothing was sent.`);
  if (slots[0].owner === "Luke") throw new StaffError(`${platform} is yours: you upload it yourself. Nothing was sent.`);
  const bot = slots[0].owner;
  const doc = await getProfiles(store);
  const todo = slots.filter((s) => { const c = profileCheck(doc, s); return c.master && !c.has; });
  if (!todo.length) throw new StaffError(slots.some((s) => profileCheck(doc, s).master) ? `${platform} already has your upload. Nothing was sent.` : "Upload your photo or banner first. Nothing was sent.");
  const at = new Date(now).toISOString();
  await changeProfiles(store, (d) => { for (const s of todo) d.retry[s.id] = { at, by }; return { saved: true }; });
  const mailId = "profile-retry-" + pid;
  const open = (await listMessages(store, now, 2)).find((m) => m && m.mailId === mailId && m.to === bot && isOpen(m));
  if (open) return { sent: false, already: true, to: bot, platform, at: open.at, slots: todo.map((s) => s.id), note: `${bot} already has your last "Try again". It is on ${bot}'s list for its next run.` };
  const what = andList([...new Set(todo.map((s) => (profileGroup(s) === "banner" ? "banner" : "profile photo")))]);
  const steps = PROFILE_STEPS.replace("sort it out with Luke in your chat", "sort it out with me in your chat");
  const text = `Try ${platform} again: log in, put up my ${what} (the sized copy from profile_master, or your AI version), ${steps} Slots: ${todo.map((s) => s.id).join(", ")}.`;
  const r = await sendMessage(store, now, roster, { from: "Luke", to: bot, needs: "action", text, mailId });
  return { sent: true, to: bot, platform, at: r.message.at, slots: todo.map((s) => s.id), note: `Sent to ${bot}. ${bot} tries again on its next run.` };
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
  if (!/^(master-photo|master-banner|(?:slot|shot)-[a-z0-9-]{1,40})$/.test(key)) return nf();
  if ((key.startsWith("slot-") || key.startsWith("shot-")) && !PROFILE_SLOTS.some((s) => s.id === key.slice(5))) return nf();
  let doc = null;
  try { doc = await store.get(FILE(key), { type: "json" }); } catch { doc = null; }
  if (!doc || !doc.b64) return nf();
  const type = doc.type === "image/png" ? "image/png" : "image/jpeg";
  return new Response(Buffer.from(doc.b64, "base64"), { status: 200, headers: { "content-type": type, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'", "x-robots-tag": "noindex, nofollow" } });
}
