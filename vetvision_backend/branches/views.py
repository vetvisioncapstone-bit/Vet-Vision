from rest_framework import viewsets

from .models import Branch
from .serializers import BranchSerializer


class BranchViewSet(viewsets.ReadOnlyModelViewSet):
    """Branches are reference data seeded once (only 2 rows: Ibaan and San
    Jose). Read-only from the API — add them via SQL/pgAdmin, not here."""

    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
