import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dropzone } from '@/components/upload/Dropzone';

function setUserAgent(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}

function input(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

afterEach(() => vi.restoreAllMocks());

describe('Dropzone', () => {
  it('en escritorio el selector filtra por PDF, Word y HTML', async () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0');
    const { container } = render(<Dropzone onFiles={() => {}} />);
    await waitFor(() => expect(input(container).getAttribute('accept')).toContain('.docx'));
  });

  it('en Android el selector se abre sin filtro (si no, solo ofrece cámara y fotos)', async () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 13; ZTE 8050) Chrome/131.0 Mobile');
    const { container } = render(<Dropzone onFiles={() => {}} />);
    await waitFor(() => expect(input(container).hasAttribute('accept')).toBe(false));
  });

  it('en Android igual rechaza archivos que no son documentos', async () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 13) Chrome/131.0 Mobile');
    const onFiles = vi.fn();
    const { container } = render(<Dropzone onFiles={onFiles} />);
    await waitFor(() => expect(input(container).hasAttribute('accept')).toBe(false));

    const photo = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    const pdf = new File(['%PDF'], 'tarea.pdf', { type: 'application/pdf' });
    fireEvent.change(input(container), { target: { files: [photo] } });
    fireEvent.change(input(container), { target: { files: [pdf] } });

    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles.mock.calls[0][0][0].name).toBe('tarea.pdf');
  });
});
