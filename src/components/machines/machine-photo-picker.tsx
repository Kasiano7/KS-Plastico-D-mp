'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buttonClass } from '@/components/ui/primitives';

export type MachinePhotoOption = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Galerie de photos déjà importées + import d'une nouvelle — un seul champ
 * caché `photoId` porte le résultat vers `resolveMachinePhotoId`
 * (§ server/actions/machines.ts) : `'none'` pour l'illustration générique,
 * un identifiant pour une photo de la photothèque. Un nouvel import prime
 * toujours côté serveur, qu'importe la valeur de `photoId` laissée ici.
 */
export function MachinePhotoPicker({
  photos,
  currentPhotoId,
}: {
  photos: MachinePhotoOption[];
  currentPhotoId: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string>(currentPhotoId ?? 'none');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function selectExisting(id: string) {
    setSelectedId(id);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        <button
          type="button"
          onClick={() => selectExisting('none')}
          title="Illustration générique selon le fabricant"
          className={cn(
            'flex aspect-square items-center justify-center rounded-[var(--radius-control)] border-2 bg-surface-sunken text-center text-[0.6875rem] text-fg-subtle transition-colors',
            selectedId === 'none' && !previewUrl ? 'border-brand' : 'border-transparent hover:border-line',
          )}
        >
          Auto
        </button>
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => selectExisting(photo.id)}
            title={photo.fileName}
            className={cn(
              'relative aspect-square overflow-hidden rounded-[var(--radius-control)] border-2 bg-surface-sunken transition-colors',
              selectedId === photo.id && !previewUrl ? 'border-brand' : 'border-transparent hover:border-line',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- galerie de miniatures issues de la base, pas une image de mise en page. */}
            <img
              src={`/api/machine-photos/${photo.id}`}
              alt={photo.fileName}
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <label className={cn(buttonClass('secondary', 'sm'), 'cursor-pointer')}>
          <Upload className="size-3.5" />
          Importer une photo
          <input
            ref={fileInputRef}
            type="file"
            name="photo"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
        {previewUrl ? (
          <span className="flex items-center gap-2 text-[0.8125rem] text-fg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (URL objet), pas une image next/image. */}
            <img src={previewUrl} alt="Aperçu de la nouvelle photo" className="size-10 rounded object-cover" />
            Nouvelle photo sélectionnée — remplacera la sélection ci-dessus.
          </span>
        ) : null}
      </div>

      <input type="hidden" name="photoId" value={selectedId} />
    </div>
  );
}
