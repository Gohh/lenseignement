import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { BRANCHES, BranchCodeSchema, type Branch } from '@lenseignement/types';
import { Public } from '../auth/public.decorator.js';

/** Catalogue public : lecture seule, aucune donnée d'apprenant. Les programmes versionnés sont servis par CurriculaController. */
@Public()
@Controller('catalog')
export class CatalogController {
  @Get('branches')
  listBranches(): { items: readonly Branch[] } {
    return { items: BRANCHES };
  }

  @Get('branches/:code')
  getBranch(@Param('code') code: string): Branch {
    const parsed = BranchCodeSchema.safeParse(code);
    const branch = parsed.success ? BRANCHES.find((b) => b.code === parsed.data) : undefined;
    if (!branch) throw new NotFoundException('Branche inconnue.');
    return branch;
  }
}
