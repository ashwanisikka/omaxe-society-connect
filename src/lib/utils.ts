import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getAvatarUrl(uid: string | undefined, gender?: string) {
  if (!uid) return '';
  const cleanSeed = uid.replace(/[^a-zA-Z0-9]/g, '').slice(-12);
  const type = 'avataaars';
  const genderSeed = gender === 'female' ? 'female' : 'male';
  
  // Use stable parameters for Dicebear 9.x
  const top = gender === 'female' ? 'longHair,curvy' : 'shortHair,frizzle,dreads';
  
  return `https://api.dicebear.com/9.x/${type}/svg?seed=${genderSeed}_${cleanSeed}&top=${top}&mouth=smile`;
}
