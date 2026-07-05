/**
 * Optimización automática de modelos 3D (.glb).
 *
 * Cada modelo que sube un usuario pasa por aquí antes de guardarse:
 *   - dedup/prune/weld: limpia geometría duplicada e inservible
 *   - textureCompress:  texturas → WebP, máx. 512px (sharp)
 *   - draco:            compresión de mallas
 *
 * Resultado típico: ~10MB → menos de 1MB sin perder la forma.
 * Si algo falla (modelo corrupto, extensión rara), el que llama
 * debe usar el buffer original como fallback.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup, prune, weld, resample, textureCompress, draco,
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

let ioPromise = null;

function getIO() {
  if (!ioPromise) {
    ioPromise = (async () => {
      const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
      io.registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(),
        'draco3d.encoder': await draco3d.createEncoderModule(),
      });
      return io;
    })();
  }
  return ioPromise;
}

/**
 * @param {Buffer} buffer - .glb original subido por el usuario
 * @returns {Promise<Buffer>} .glb optimizado
 */
export async function optimizeGlb(buffer) {
  const io = await getIO();
  const doc = await io.readBinary(new Uint8Array(buffer));

  await doc.transform(
    dedup(),
    prune(),
    weld(),
    resample(),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [512, 512],
    }),
    draco(),
  );

  return Buffer.from(await io.writeBinary(doc));
}
