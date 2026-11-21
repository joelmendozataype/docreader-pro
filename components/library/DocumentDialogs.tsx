'use client';

import { type FormEvent, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DocumentMeta } from '@/types/document';

/** Conserva el último documento mientras el diálogo hace su animación de cierre. */
function useRetained(value: DocumentMeta | null): DocumentMeta | null {
  const [kept, setKept] = useState(value);
  if (value && value !== kept) setKept(value);
  return value ?? kept;
}

export function RenameDialog({
  doc,
  onClose,
  onSubmit,
}: {
  doc: DocumentMeta | null;
  onClose: () => void;
  onSubmit: (id: string, title: string) => Promise<boolean>;
}) {
  const shown = useRetained(doc);
  return (
    <Dialog open={!!doc} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {/* key: reinicia el formulario al cambiar de documento */}
        {shown && <RenameForm key={shown.id} doc={shown} onClose={onClose} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  doc,
  onClose,
  onSubmit,
}: {
  doc: DocumentMeta;
  onClose: () => void;
  onSubmit: (id: string, title: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(doc.title);
  const [saving, setSaving] = useState(false);
  const empty = !title.trim();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (empty) return;
    setSaving(true);
    const ok = await onSubmit(doc.id, title);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Renombrar documento</DialogTitle>
        <DialogDescription>El archivo original «{doc.fileName}» no cambia.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="rename-title">Nombre</Label>
        <Input
          id="rename-title"
          value={title}
          maxLength={200}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={empty}
          aria-describedby={empty ? 'rename-error' : undefined}
        />
        {empty && (
          <p id="rename-error" className="text-destructive text-xs">
            Escribe un nombre.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={empty || saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteDialog({
  doc,
  onClose,
  onConfirm,
}: {
  doc: DocumentMeta | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
}) {
  const shown = useRetained(doc);
  return (
    <AlertDialog open={!!doc} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar este documento?</AlertDialogTitle>
          <AlertDialogDescription>
            «{shown?.title}» se quitará de tu biblioteca junto con tu progreso de lectura. Podrás deshacerlo
            durante unos segundos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (doc) onConfirm(doc.id);
              onClose();
            }}
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
