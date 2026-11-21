import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedControl } from '@/components/reader/SegmentedControl';
import { TableOfContents } from '@/components/reader/TableOfContents';

const sections = [
  { id: 'sec-1', title: 'Introducción', level: 1 },
  { id: 'sec-2', title: 'Marco teórico', level: 2 },
  { id: 'sec-3', title: 'Antecedentes', level: 3 },
];

describe('TableOfContents', () => {
  it('lista las secciones y marca la actual con aria-current', () => {
    render(<TableOfContents sections={sections} activeId="sec-2" onNavigate={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Índice del documento' });
    expect(nav).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Marco teórico' })).toHaveAttribute('aria-current', 'location');
    expect(screen.getByRole('link', { name: 'Introducción' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Antecedentes' })).toHaveAttribute('href', '#sec-3');
  });

  it('al hacer clic navega sin recargar', () => {
    const onNavigate = vi.fn();
    render(<TableOfContents sections={sections} activeId={null} onNavigate={onNavigate} />);
    const link = screen.getByRole('link', { name: 'Antecedentes' });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(onNavigate).toHaveBeenCalledWith('sec-3');
    expect(event.defaultPrevented).toBe(true);
  });

  it('mensaje cuando no hay títulos', () => {
    render(<TableOfContents sections={[]} activeId={null} onNavigate={() => {}} />);
    expect(screen.getByText('No se detectaron títulos en este documento.')).toBeInTheDocument();
  });
});

function Controlled() {
  const [value, setValue] = useState<'a' | 'b' | 'c'>('b');
  return (
    <SegmentedControl
      label="Ancho"
      value={value}
      onChange={setValue}
      options={[
        { value: 'a', label: 'Angosto' },
        { value: 'b', label: 'Medio' },
        { value: 'c', label: 'Amplio' },
      ]}
    />
  );
}

describe('SegmentedControl (radiogroup accesible)', () => {
  it('expone radiogroup con nombre y una sola opción tabulable', () => {
    render(<Controlled />);
    expect(screen.getByRole('radiogroup', { name: 'Ancho' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(screen.getByRole('radio', { name: 'Medio' })).toHaveAttribute('aria-checked', 'true');
  });

  it('las flechas, Home y End cambian la opción y mueven el foco', () => {
    render(<Controlled />);
    const medio = screen.getByRole('radio', { name: 'Medio' });
    medio.focus();
    fireEvent.keyDown(medio, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Amplio' })).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Amplio' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Angosto' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByRole('radio', { name: 'Amplio' })).toHaveAttribute('aria-checked', 'true');
  });
});
