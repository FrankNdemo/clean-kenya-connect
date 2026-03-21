from django.core.management.base import BaseCommand
from core.models import WasteType

class Command(BaseCommand):
    help = 'Seeds initial waste types'

    def handle(self, *args, **kwargs):
        waste_types = [
            {'type_name': 'General Waste', 'description': 'Non-recyclable household waste', 'is_recyclable': False},
            {'type_name': 'Plastic', 'description': 'Plastic bottles, containers, bags', 'is_recyclable': True},
            {'type_name': 'Paper', 'description': 'Paper, cardboard, newspapers', 'is_recyclable': True},
            {'type_name': 'Metal', 'description': 'Aluminum cans, metal containers', 'is_recyclable': True},
            {'type_name': 'Glass', 'description': 'Glass bottles, containers', 'is_recyclable': True},
            {'type_name': 'Organic', 'description': 'Food waste, garden waste', 'is_recyclable': True},
            {'type_name': 'Electronic', 'description': 'E-waste, electronics', 'is_recyclable': True},
        ]
        
        for wt in waste_types:
            WasteType.objects.get_or_create(type_name=wt['type_name'], defaults=wt)
        
        self.stdout.write(self.style.SUCCESS('Successfully seeded waste types'))