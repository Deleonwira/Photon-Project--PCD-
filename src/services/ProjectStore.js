/* PHOTON — Unified Project Store */

import { isLoggedIn } from '../utils/auth.js';
import * as localStore from './LocalProjectStore.js';
import * as serverService from './ProjectService.js';

export async function listAllProjects() {
  if (isLoggedIn()) {
    try {
      const serverProjects = await serverService.listProjects();
      return serverProjects.map(p => ({
        id: p.id,
        name: p.name,
        width: p.width,
        height: p.height,
        background: p.background,
        thumbnailDataUrl: p.thumbnail_b64 || null,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }));
    } catch (err) {
      console.error('Failed to list projects from server:', err);
      throw err;
    }
  } else {
    return localStore.listAllProjects();
  }
}

export async function getProject(id) {
  const isServerId = !isNaN(id) && id !== null && id !== '';
  if (isLoggedIn() && isServerId) {
    try {
      const p = await serverService.getProject(id);
      return {
        id: p.id,
        name: p.name,
        width: p.width,
        height: p.height,
        background: p.background,
        rawImageSrc: p.raw_image_src || null,
        imageTransform: p.image_transform ? JSON.parse(p.image_transform) : null,
        imageDataUrl: p.image_b64 ? `data:image/png;base64,${p.image_b64}` : null,
        thumbnailDataUrl: p.thumbnail_b64 || null,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      };
    } catch (err) {
      console.error(`Failed to get project ${id} from server:`, err);
      throw err;
    }
  } else {
    return localStore.getProject(id);
  }
}

export async function saveProject(project) {
  if (isLoggedIn()) {
    try {
      const isNew = !project.id || isNaN(project.id);
      if (isNew) {
        const res = await serverService.createProject(
          project.name,
          project.width,
          project.height,
          project.background
        );
        project.id = res.id;
      }

      const imageBase64 = project.imageDataUrl
        ? project.imageDataUrl.split(',')[1] || project.imageDataUrl
        : null;

      await serverService.updateProject(project.id, {
        name: project.name,
        width: project.width,
        height: project.height,
        background: project.background,
        image_b64: imageBase64,
        raw_image_src: project.rawImageSrc || null,
        image_transform: project.imageTransform ? JSON.stringify(project.imageTransform) : null,
        thumbnail_b64: project.thumbnailDataUrl || null,
      });

      return project;
    } catch (err) {
      console.error('Failed to save project to server:', err);
      throw err;
    }
  } else {
    return localStore.saveProject(project);
  }
}

export async function deleteProject(id) {
  const isServerId = !isNaN(id) && id !== null && id !== '';
  if (isLoggedIn() && isServerId) {
    try {
      return await serverService.deleteProject(id);
    } catch (err) {
      console.error(`Failed to delete project ${id} from server:`, err);
      throw err;
    }
  } else {
    return localStore.deleteProject(id);
  }
}

export function generateThumbnail(sourceCanvas, maxWidth = 200) {
  return localStore.generateThumbnail(sourceCanvas, maxWidth);
}
