from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance
from typing import Tuple, Optional

class ImageProcessor:
    @staticmethod
    def fix_exif_orientation(image: Image.Image) -> Image.Image:
        """Kamera veya telefon kaynaklı EXIF yönelimini düzeltir"""
        try:
            return ImageOps.exif_transpose(image)
        except Exception:
            return image

    @staticmethod
    def rotate_image(image_path: Path, degrees: int = 90) -> None:
        """Görseli verilen açı kadar döndürüp aynı dosyaya kaydeder (Kayıpsız 90° katları)"""
        with Image.open(image_path) as img:
            img = ImageProcessor.fix_exif_orientation(img)
            # PIL rotate pozitif açıyı saat yönünün tersine döndürür, bu yüzden -degrees kullanılır (saat yönü için)
            rotated = img.rotate(-degrees, expand=True)
            rotated.save(image_path, quality=95)

    @staticmethod
    def generate_thumbnail(image_path: Path, thumb_path: Path, size: Tuple[int, int] = (240, 240)) -> None:
        """Kuyruk listesi için hafif ve hızlı thumbnail üretir"""
        try:
            with Image.open(image_path) as img:
                img = ImageProcessor.fix_exif_orientation(img)
                img.thumbnail(size, Image.Resampling.LANCZOS)
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                img.save(thumb_path, "JPEG", quality=80)
        except Exception as e:
            print(f"Thumbnail oluşturulamadı: {e}")

    @staticmethod
    def enhance_contrast(image_path: Path, output_path: Optional[Path] = None, factor: float = 1.3) -> Path:
        """Karanlık veya gölgeli sevk irsaliyeleri için kontrast artırır"""
        target = output_path or image_path
        with Image.open(image_path) as img:
            img = ImageProcessor.fix_exif_orientation(img)
            enhancer = ImageEnhance.Contrast(img)
            enhanced = enhancer.enhance(factor)
            enhanced.save(target, quality=95)
        return target

image_processor = ImageProcessor()
