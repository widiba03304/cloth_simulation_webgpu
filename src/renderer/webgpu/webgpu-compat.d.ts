/**
 * TypeScript 5.2+ made TypedArrays generic (Float32Array<TArrayBuffer>).
 * TS DOM lib defines BufferSource = ArrayBufferView<ArrayBuffer> | ArrayBuffer.
 * But new Float32Array(n) is typed as Float32Array<ArrayBufferLike> (the default),
 * which does not satisfy ArrayBufferView<ArrayBuffer> — so GPUQueue.writeBuffer rejects it.
 *
 * This module augments GPUQueue to add an overload accepting the wider ArrayBufferView type,
 * matching the actual WebGPU spec intent.
 *
 * AGENT: do not remove until @webgpu/types ships an upstream fix for TS 5.2+ typed arrays.
 */

export {}; // make this a module so `declare global` is scoped correctly

declare global {
  interface GPUQueue {
    /** Overload: accepts Float32Array<ArrayBufferLike> and other generic typed arrays (TS 5.2+) */
    writeBuffer(
      buffer: GPUBuffer,
      bufferOffset: number,
      data: ArrayBufferView | ArrayBuffer | SharedArrayBuffer,
      dataOffset?: number,
      size?: number,
    ): undefined;
  }
}
