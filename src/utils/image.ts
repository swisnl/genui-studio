import type { AgentImage } from '@/stores/agent'

export const SUPPORTED_IMAGE_TYPES: AgentImage['mediaType'][] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

// Anthropic recommends a long edge of at most 1568px; larger images are downscaled
// server-side anyway, so shrinking them here saves upload time and request size.
const MAX_DIMENSION = 1568
// Both providers reject images above roughly 5MB, so re-encode anything bigger.
const MAX_BYTES = 4 * 1024 * 1024

export function isSupportedImage(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(file.type as AgentImage['mediaType'])
}

export function imageToDataUrl(image: AgentImage): string {
  return `data:${image.mediaType};base64,${image.data}`
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
    reader.readAsDataURL(blob)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode image'))
    img.src = src
  })
}

export async function readImageFile(file: File): Promise<AgentImage> {
  if (!isSupportedImage(file)) {
    throw new Error(`Unsupported image type "${file.type || 'unknown'}". Use PNG, JPEG, GIF or WebP.`)
  }

  let dataUrl = await readAsDataUrl(file)
  let mediaType = file.type as AgentImage['mediaType']

  const img = await loadImage(dataUrl)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight))

  if (scale < 1 || file.size > MAX_BYTES) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to process image')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    // Keep PNG for transparency; everything else (including animated GIFs,
    // which only keep their first frame) is re-encoded as JPEG.
    mediaType = mediaType === 'image/png' ? 'image/png' : 'image/jpeg'
    dataUrl = canvas.toDataURL(mediaType, 0.9)
    if (mediaType === 'image/png' && dataUrl.length * 0.75 > MAX_BYTES) {
      mediaType = 'image/jpeg'
      dataUrl = canvas.toDataURL(mediaType, 0.9)
    }
  }

  return {
    mediaType,
    data: dataUrl.slice(dataUrl.indexOf(',') + 1),
    name: file.name,
  }
}
