// Прямая загрузка файла в Cloudflare R2 по presigned PUT URL, полученному
// с бэкенда. Идёт мимо общего axios-инстанса (api.ts): чужой домен, без
// куки/withCredentials. XMLHttpRequest, а не fetch — только у него есть
// upload.onprogress для индикации прогресса.
export function uploadFileToR2(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 вернул ошибку при загрузке файла (статус ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Сетевая ошибка при загрузке файла в R2"));
    xhr.onabort = () => reject(new Error("Загрузка файла в R2 прервана"));

    xhr.send(file);
  });
}
