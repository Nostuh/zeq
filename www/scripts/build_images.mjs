import { cron } from '../api/ki/rest/images.mjs';






async function build_images() {
    await cron.build_full_image_structure();
    return true;
}

await build_images();


process.exit(0);