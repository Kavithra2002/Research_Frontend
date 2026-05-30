export type StorageFileInfo = {
  name: string;
  size: number;
  modifiedAt: string;
};

export type StorageListResult = {
  directories: string[];
  files: StorageFileInfo[];
};
