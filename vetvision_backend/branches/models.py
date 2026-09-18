from django.db import models


class Branch(models.Model):
    """Maps onto the existing `branch` table. managed=False everywhere in
    this project means: Django never creates/alters/drops this table via
    migrations — it only describes what's already there so the ORM can
    query it. The real DDL lives in vetvisiondb.sql."""

    branch_id = models.CharField(primary_key=True, max_length=10)
    branch_name = models.CharField(max_length=80)
    town = models.CharField(max_length=40)
    address = models.CharField(max_length=160)
    date_opened = models.DateField()

    class Meta:
        managed = False
        db_table = "branch"
        ordering = ["branch_id"]

    def __str__(self):
        return self.branch_name
