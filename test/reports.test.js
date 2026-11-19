import { test } from "node:test";
import assert from "node:assert/strict";

test("a report's computer: tidy processor and graphics names, never the raw strings", async () => {
  const { tidyCpu, tidyGpu, osName } = await import("../src/computer.js");
  assert.equal(tidyCpu("12th Gen Intel(R) Core(TM) i7-12700H"), "12th Gen Intel Core i7-12700H");
  assert.equal(tidyCpu("Intel(R) Core(TM) i7-1185G7 CPU @ 3.00GHz"), "Intel Core i7-1185G7");
  assert.equal(tidyCpu("AMD Ryzen 7 5800X 8-Core Processor"), "AMD Ryzen 7 5800X 8-Core");
  assert.equal(tidyCpu("Apple M2 Pro"), "Apple M2 Pro");
  const nv = { gpuDevice: [{ active: false, deviceString: "" }, { active: true, driverVersion: "32.0.15.9649" }], auxAttributes: { glRenderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU (0x00002520) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.15.9649)" } };
  assert.equal(tidyGpu(nv, "win32"), "NVIDIA GeForce RTX 3050 Laptop GPU (driver 32.0.15.9649)");
  assert.equal(tidyGpu({ gpuDevice: [{ active: true, driverVersion: "1.0" }], auxAttributes: { glRenderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)" } }, "darwin"), "Apple M2 Pro");
  assert.equal(tidyGpu({ gpuDevice: [{ active: true, deviceString: "Intel(R) Iris(R) Xe Graphics", driverVersion: "31.0.101.5186" }] }, "win32"), "Intel Iris Xe Graphics (driver 31.0.101.5186)");
  // What a real Mac answers: the whole renderer line as the device name.
  assert.equal(tidyGpu({ gpuDevice: [{ active: true, deviceString: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Version 27.0 (Build 26A5378j))" }] }, "darwin"), "Apple M1 Max");
  assert.equal(tidyGpu(null), "");
  assert.equal(osName("win32", "Windows 11 Pro", "10.0.22631"), "Windows 11 Pro (22631)");
  assert.equal(osName("darwin", "Darwin Kernel", "24.1.0", "15.1"), "macOS 15.1");
});

test("screening: a plain computer with no note shows by itself; a note, a link or odd text is read first", async () => {
  const { screen } = await import("../src/reportscreen.js");
  const pc = { os: "Windows 11 Pro (22631)", cpu: "12th Gen Intel Core i7-12700H", gpu: "NVIDIA GeForce RTX 3050 Laptop GPU (driver 32.0.15.9649)", ram: 24 };
  assert.equal(screen(pc), "show");
  assert.equal(screen({ os: "macOS 15.1", cpu: "Apple M2 Pro", gpu: "Apple M2 Pro" }), "show");
  assert.equal(screen({ os: "Fedora Linux 41 (Workstation Edition)", cpu: "AMD Ryzen 5 5600", gpu: "Radeon RX 6600 (driver 24.2.1)" }), "show");
  assert.equal(screen({}), "show");                                                       // nothing to show, nothing to read
  assert.equal(screen({ ...pc, note: "Runs great." }), "read");                           // every note is read
  assert.equal(screen({ ...pc, cpu: "Intel Core - cheap keys at gamekeys.shop" }), "read");
  assert.equal(screen({ ...pc, gpu: "call me on 555-0100" }), "read");
  assert.equal(screen({ ...pc, os: "Windows <script>" }), "read");
});
