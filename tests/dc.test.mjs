/* The data-centre IP filter (netlify/lib/dc.mjs + dc-ranges.json, 9 Nov 2026). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { datacenter, ipv4Number, ipv6Prefix, DC_UPDATED } from "../netlify/lib/dc.mjs";

test("Meta's own network (the Instagram/Facebook link scanners) is a data centre", () => {
  for (const ip of ["31.13.64.1", "157.240.1.1", "66.220.149.1", "69.171.250.1", "173.252.127.1", "2a03:2880:f12f:83:face:b00c::25de"]) {
    assert.equal(datacenter(ip), "meta", ip);
  }
});

test("Amazon, Microsoft and Google Cloud machines are data centres", () => {
  assert.equal(datacenter("3.5.140.2"), "aws");
  assert.equal(datacenter("52.94.1.1"), "aws");
  assert.equal(datacenter("2600:1f18::1"), "aws");
  assert.equal(datacenter("20.1.1.1"), "azure");
  assert.ok(["google", "aws", "azure", "meta", "apple"].includes(datacenter("35.199.0.1")), "35.199/16 is Google Cloud");
});

test("people on Brazilian phone and home networks, and public resolvers, are not", () => {
  for (const ip of ["177.37.1.1", "189.6.1.1", "200.147.1.1", "187.10.20.30", "2804:14c::1", "2804:7f0:abcd::1", "8.8.8.8", "1.1.1.1"]) {
    assert.equal(datacenter(ip), "", ip);
  }
});

test("odd input never throws and never matches", () => {
  for (const ip of ["", null, undefined, "not an ip", "999.1.1.1", "1.2.3", ":::", "2a03:2880::face::1", "fe80::1%en0"]) {
    assert.equal(datacenter(ip), "", String(ip));
  }
  assert.equal(datacenter("::ffff:157.240.1.1"), "meta", "IPv4-mapped IPv6");
});

test("address parsing", () => {
  assert.equal(ipv4Number("1.2.3.4"), 16909060);
  assert.equal(ipv4Number("255.255.255.255"), 4294967295);
  assert.equal(ipv4Number("256.1.1.1"), null);
  assert.equal(ipv6Prefix("2a03:2880::1"), "2a03288000000000");
  assert.equal(ipv6Prefix("2804:14c:1:2:3:4:5:6"), "2804014c00010002");
  assert.equal(ipv6Prefix("::1"), "0000000000000000");
});

test("the range file is reasonably fresh (re-run tools/refresh-ip-ranges.mjs if this fails)", () => {
  const age = (Date.now() - Date.parse(DC_UPDATED)) / 86400000;
  assert.ok(age < 120, `dc-ranges.json is ${Math.round(age)} days old`);
});
