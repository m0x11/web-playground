// Asset import — browser side.
//
// Uploads a picked File to the /__import dev endpoint, which copies it into
// assets/ and returns a project-relative path. Scenes store that path;
// components resolve it to a URL via assetUrl().

export async function importFile(file) {
  const res = await fetch('/__import', {
    method: 'POST',
    // URL-encode: HTTP header values must be Latin-1, but filenames can hold
    // arbitrary Unicode (e.g. macOS screenshots use U+202F before AM/PM).
    headers: { 'X-Filename': encodeURIComponent(file.name) },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Import failed (${res.status})`);
  }
  const { path, error } = await res.json();
  if (error) throw new Error(error);
  return path;
}

// Open a native file picker and import every chosen file. Returns the list of
// stored asset paths (in pick order).
export function pickAndImport({ accept = '', multiple = false } = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const files = [...(input.files ?? [])];
      input.remove();
      if (files.length === 0) return resolve([]);
      const paths = [];
      const failed = [];
      for (const file of files) {
        try {
          paths.push(await importFile(file));
        } catch (err) {
          console.error('import failed for', file.name, err);
          failed.push(file.name);
        }
      }
      if (failed.length > 0) {
        alert(`Couldn't import ${failed.length} file(s):\n${failed.join('\n')}`);
      }
      resolve(paths);
    });
    input.click();
  });
}

// A stored path is project-relative ("assets/foo-ab12cd34.png"). Vite serves
// the project root, so the URL is just a leading slash. URLs (http/https) and
// data: URIs pass through untouched.
export function assetUrl(path) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
}
