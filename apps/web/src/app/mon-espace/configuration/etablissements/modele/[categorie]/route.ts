import { ESTABLISHMENT_CATEGORIES, establishmentTemplate } from '@lenseignement/types';
import type { EstablishmentCategory } from '@lenseignement/types';

// Canevas d'import d'une catégorie : en-têtes (astérisque = obligatoire) et une ligne d'exemple.
// Le BOM fait ouvrir le fichier en UTF-8 par Excel, accents compris.

const FILE_NAMES: Record<EstablishmentCategory, string> = {
  preschool: 'modele-prescolaire.csv',
  primary: 'modele-ecoles-primaires.csv',
  college: 'modele-colleges.csv',
  lycee: 'modele-lycees.csv',
  literacy_center: 'modele-centres-alphabetisation.csv',
  technical_center: 'modele-enseignement-technique.csv',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ categorie: string }> },
) {
  const { categorie } = await params;
  if (!(ESTABLISHMENT_CATEGORIES as readonly string[]).includes(categorie)) {
    return new Response('Type d’établissement inconnu.', { status: 404 });
  }
  const category = categorie as EstablishmentCategory;
  return new Response(`\uFEFF${establishmentTemplate(category)}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${FILE_NAMES[category]}"`,
      'cache-control': 'no-store',
    },
  });
}
