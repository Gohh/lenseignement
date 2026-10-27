import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  CourseOutlineSchema,
  CreateCourseSchema,
  UpdateCourseVersionSchema,
} from '@lenseignement/types';
import type { Request } from 'express';
import { z } from 'zod';
import { AccessService, type AuthoringRequest } from '../access/access.service.js';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersService } from '../users/users.service.js';
import {
  CourseError,
  createCourse,
  createNextVersion,
  deleteDraft,
  getCourse,
  getCourseVersion,
  listAuthoringOrganizations,
  listCourses,
  organizationOfCourse,
  organizationOfVersion,
  replaceOutline,
  updateCourseVersion,
} from './courses.js';

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(z.prettifyError(result.error));
  return result.data;
}

function translate(error: unknown): never {
  if (error instanceof CourseError) {
    if (error.kind === 'invalid') throw new BadRequestException(error.message);
    if (error.kind === 'not_found') throw new NotFoundException(error.message);
    throw new ConflictException(error.message);
  }
  throw error;
}

/**
 * Rédaction des cours, réservée au personnel des structures concernées (ADR-005).
 * Chaque accès est contrôlé et journalisé avant toute lecture ou écriture.
 */
@Controller('authoring')
export class AuthoringController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
    private readonly access: AccessService,
  ) {}

  private async authorize(
    request: Request,
    check: Omit<AuthoringRequest, 'userId' | 'traceId'>,
  ): Promise<string> {
    const user = await this.users.resolve(request.principal as Principal);
    await this.access.assertCanAuthor({ ...check, userId: user.id, traceId: request.traceId });
    return user.id;
  }

  private async authorizeCourse(request: Request, action: string, courseId: string) {
    return this.authorize(request, {
      action,
      resourceType: 'course',
      resourceId: courseId,
      organizationId: await organizationOfCourse(this.db, courseId),
    });
  }

  private async authorizeVersion(request: Request, action: string, versionId: string) {
    return this.authorize(request, {
      action,
      resourceType: 'course_version',
      resourceId: versionId,
      organizationId: await organizationOfVersion(this.db, versionId),
    });
  }

  @Get('organizations')
  async organizations(@Req() request: Request) {
    const user = await this.users.resolve(request.principal as Principal);
    return { items: await listAuthoringOrganizations(this.db, user.id) };
  }

  @Get('courses')
  async list(@Req() request: Request) {
    const user = await this.users.resolve(request.principal as Principal);
    return { items: await listCourses(this.db, user.id) };
  }

  @Post('courses')
  async create(@Req() request: Request, @Body() body: unknown) {
    const input = parse(CreateCourseSchema, body);
    const userId = await this.authorize(request, {
      action: 'course.create',
      resourceType: 'organization',
      resourceId: input.organizationId,
      organizationId: input.organizationId,
    });
    return createCourse(this.db, userId, input);
  }

  @Get('courses/:id')
  async course(@Req() request: Request, @Param('id') id: string) {
    await this.authorizeCourse(request, 'course.read', id);
    return getCourse(this.db, id).catch(translate);
  }

  @Post('courses/:id/versions')
  async nextVersion(@Req() request: Request, @Param('id') id: string) {
    const userId = await this.authorizeCourse(request, 'course.new_version', id);
    return { versionId: await createNextVersion(this.db, id, userId).catch(translate) };
  }

  @Get('course-versions/:id')
  async version(@Req() request: Request, @Param('id') id: string) {
    await this.authorizeVersion(request, 'course_version.read', id);
    return getCourseVersion(this.db, id).catch(translate);
  }

  @Patch('course-versions/:id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    await this.authorizeVersion(request, 'course_version.update', id);
    const input = parse(UpdateCourseVersionSchema, body);
    return updateCourseVersion(this.db, id, input).catch(translate);
  }

  @Put('course-versions/:id/outline')
  async outline(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    await this.authorizeVersion(request, 'course_version.update', id);
    const input = parse(CourseOutlineSchema, body);
    return replaceOutline(this.db, id, input).catch(translate);
  }

  @Delete('course-versions/:id')
  @HttpCode(204)
  async remove(@Req() request: Request, @Param('id') id: string): Promise<void> {
    await this.authorizeVersion(request, 'course_version.delete', id);
    await deleteDraft(this.db, id).catch(translate);
  }
}
