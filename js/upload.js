// ============================================================
// Upload de fotos: comprime no celular antes de enviar (app fica leve
// e rápido mesmo em 4G na estrada) e sobe pro Cloudinary sem servidor
// próprio, usando um upload preset "unsigned".
// ============================================================

import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, CLOUDINARY_PASTA } from './cloudinary-config.js';

const LADO_MAXIMO = 1600; // px — suficiente pra qualquer tela, arquivo bem menor que a foto original
const QUALIDADE = 0.82;

/** Redimensiona/comprime uma foto no navegador antes de enviar. */
function comprimirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      let { width, height } = img;
      if (width > LADO_MAXIMO || height > LADO_MAXIMO) {
        if (width > height) {
          height = Math.round(height * (LADO_MAXIMO / width));
          width = LADO_MAXIMO;
        } else {
          width = Math.round(width * (LADO_MAXIMO / height));
          height = LADO_MAXIMO;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao comprimir imagem'))), 'image/jpeg', QUALIDADE);
    };
    img.onerror = () => reject(new Error('Não foi possível ler a imagem'));
    img.src = url;
  });
}

/**
 * Comprime e envia uma foto para o Cloudinary.
 * @param {File} arquivo
 * @param {(progresso:number)=>void} [aoProgredir] opcional, 0-100
 * @returns {Promise<{url:string, publicId:string}>}
 */
export async function enviarFoto(arquivo, aoProgredir) {
  if (CLOUDINARY_CLOUD_NAME.startsWith('SEU_')) {
    throw new Error('Configure o Cloudinary em js/cloudinary-config.js antes de enviar fotos.');
  }

  const blob = await comprimirImagem(arquivo);

  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', CLOUDINARY_PASTA);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);

    xhr.upload.onprogress = (e) => {
      if (aoProgredir && e.lengthComputable) aoProgredir(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const resp = JSON.parse(xhr.responseText);
        resolve({ url: resp.secure_url, publicId: resp.public_id });
      } else {
        reject(new Error('Falha no upload da foto (' + xhr.status + ')'));
      }
    };
    xhr.onerror = () => reject(new Error('Erro de rede ao enviar a foto'));
    xhr.send(formData);
  });
}

/** Gera uma URL de thumbnail leve a partir de uma URL do Cloudinary. */
export function urlMiniatura(urlOriginal, largura = 200) {
  if (!urlOriginal || !urlOriginal.includes('/upload/')) return urlOriginal;
  return urlOriginal.replace('/upload/', `/upload/w_${largura},h_${largura},c_fill,q_auto,f_auto/`);
}
