import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  CatalogQuerySchema,
  type CatalogCourseDetail,
  type CatalogLesson,
  type CatalogPage,
} from '@lenseignement/types';
import { z } from 'zod';
import { Public } from '../auth/public.decorator.js';
import { DATABASE, type Database } from '../db/database.js';
import { getCatalogCourse, getCatalogLesson, searchCatalog } from './course-catalog.js';

/** Catalogue public des cours publiés (ADR-007) : sans connexion, sans donnée personnelle. */
@Public()
@Controller('catalog/courses')
export class CatalogCoursesController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  async search(@Query() query: Record<string, unknown>): Promise<CatalogPage> {
    const parsed = CatalogQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    return searchCatalog(this.db, parsed.data);
  }

  @Get(':id')
  async course(@Param('id') id: string): Promise<CatalogCourseDetail> {
    const course = await getCatalogCourse(this.db, id);
    if (!course) throw new NotFoundException('Cours introuvable.');
    return course;
  }

  @Get(':id/lessons/:number')
  async lesson(@Param('id') id: string, @Param('number') number: string): Promise<CatalogLesson> {
    const lesson = /^\d{1,4}$/.test(number)
      ? await getCatalogLesson(this.db, id, Number(number))
      : null;
    if (!lesson) throw new NotFoundException('Leçon introuvable.');
    return lesson;
  }
}
