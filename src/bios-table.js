// Known system-file checksums, copied from open-source emulators - not from memory.
// PS1 BIOS MD5s: https://github.com/stenzek/duckstation/blob/master/src/core/bios.cpp (s_image_info_by_hash)
// GBA BIOS: https://github.com/mgba-emu/mgba/blob/master/include/mgba/internal/gba/bios.h (GBA_BIOS_CHECKSUM)
//           checksum = sum of all little-endian 32-bit words, per GBAChecksum() in src/gba/bios.c

export const GBA_BIOS_CHECKSUM = 0xBAAE187F;
export const GBA_BIOS_SIZE = 16384;

// md5 -> { region, name }
export const PS1_BIOS_MD5 = {
  "239665b1a3dade1b5a52c06338011044": { region: "NTSC_J", name: "SCPH-1000, DTL-H1000 (v1.0)" },
  "924e392ed05558ffdb115408c263dccf": { region: "NTSC_U", name: "SCPH-1001, 5003, DTL-H1201, H3001 (v2.2 12-04-95 A)" },
  "54847e693405ffeb0359c6287434cbef": { region: "PAL", name: "SCPH-1002, DTL-H1002 (v2.0 05-10-95 E)" },
  "417b34706319da7cf001e76e40136c23": { region: "PAL", name: "SCPH-1002, DTL-H1102 (v2.1 07-17-95 E)" },
  "e2110b8a2b97a8e0b857a45d32f7e187": { region: "PAL", name: "SCPH-1002, DTL-H1202, H3002 (v2.2 12-04-95 E)" },
  "ca5cfc321f916756e3f0effbfaeba13b": { region: "NTSC_J", name: "DTL-H1100 (v2.2 03-06-96 D)" },
  "849515939161e62f6b866f6853006780": { region: "NTSC_J", name: "SCPH-3000, DTL-H1000H (v1.1 01-22-95)" },
  "dc2b9bf8da62ec93e868cfd29f0d067d": { region: "NTSC_U", name: "SCPH-1001, DTL-H1001 (v2.0 05-07-95 A)" },
  "cba733ceeff5aef5c32254f1d617fa62": { region: "NTSC_J", name: "SCPH-3500 (v2.1 07-17-95 J)" },
  "da27e8b6dab242d8f91a9b25d80c63b8": { region: "NTSC_U", name: "SCPH-1001, DTL-H1101 (v2.1 07-17-95 A)" },
  "57a06303dfa9cf9351222dfcbb4a29d9": { region: "NTSC_J", name: "SCPH-5000, DTL-H1200, H3000 (v2.2 12-04-95 J)" },
  "8dd7d5296a650fac7319bce665a6a53c": { region: "NTSC_J", name: "SCPH-5500 (v3.0 09-09-96 J)" },
  "490f666e1afb15b7362b406ed1cea246": { region: "NTSC_U", name: "SCPH-5501, 5503, 7003 (v3.0 11-18-96 A)" },
  "32736f17079d0b2b7024407c39bd3050": { region: "PAL", name: "SCPH-5502, 5552 (v3.0 01-06-97 E)" },
  "8e4c14f567745eff2f0408c8129f72a6": { region: "NTSC_J", name: "SCPH-7000, 7500, 9000 (v4.0 08-18-97 J)" },
  "b84be139db3ee6cbd075630aa20a6553": { region: "NTSC_J", name: "SCPH-7000W (v4.1 11-14-97 A)" },
  "1e68c231d0896b7eadcad1d7d8e76129": { region: "NTSC_U", name: "SCPH-7001, 7501, 7503, 9001, 9003, 9903 (v4.1 12-16-97 A)" },
  "b9d9a0286c33dc6b7237bb13cd46fdee": { region: "PAL", name: "SCPH-7002, 7502, 9002 (v4.1 12-16-97 E)" },
  "8abc1b549a4a80954addc48ef02c4521": { region: "NTSC_J", name: "SCPH-100 (v4.3 03-11-00 J)" },
  "9a09ab7e49b422c007e6d54d7c49b965": { region: "NTSC_U", name: "SCPH-101 (v4.4 03-24-00 A)" },
  "6e3735ff4c7dc899ee98981385f6f3d0": { region: "NTSC_U", name: "SCPH-101 (v4.5 05-25-00 A)" },
  "b10f5e0e3d9eb60e5159690680b1e774": { region: "PAL", name: "SCPH-102 (v4.4 03-24-00 E)" },
  "de93caec13d1a141a40a79f5c86168d6": { region: "PAL", name: "SCPH-102 (v4.5 05-25-00 E)" },
};
