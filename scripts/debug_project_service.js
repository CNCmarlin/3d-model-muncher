const { createStandardModelIdentity } = require('../dist-backend/utils/modelFactory');

const modelGallery = [
    '/models/3D Printer/ADXL/Clip_on_Snail_Shell_for_the_Articulated_Slug._/image_0_IMG_0483.jpg',
    '/models/3D Printer/ADXL/Clip_on_Snail_Shell_for_the_Articulated_Slug._/image_1_8c0a98ba7dcfa193235686d53da3fd2d.jpg'
];

const discoveredImages = [
    '/models/3D Printer/ADXL/Clip_on_Snail_Shell_for_the_Articulated_Slug._/image_0_IMG_0483.jpg',
    '/models/3D Printer/ADXL/Clip_on_Snail_Shell_for_the_Articulated_Slug._/image_2_IMG_0485.jpg'
];

const meta = {
    id: 'test-id',
    name: 'Test Project',
    description: 'Desc',
    public_url: 'http://url',
    license: 'CC',
    creatorName: 'Me',
    tags: ['tag1']
};

const result = createStandardModelIdentity({
    id: 'test-id',
    name: 'Test Project',
    hidden: true,
    parsedImages: Array.from(new Set([...modelGallery, ...discoveredImages])),
    userDefined: {
        thumbnail: 'parsed:0',
        imageOrder: modelGallery.map((_, idx) => `parsed:${idx}`),
        description: "",
        images: []
    }
});

console.log("--- RESULT ---");
console.log(JSON.stringify(result, null, 2));

if (result.parsedImages.length !== 3) {
    console.error("FAIL: Expected 3 unique images, got " + result.parsedImages.length);
} else {
    console.log("PASS: Images merged correctly.");
}
