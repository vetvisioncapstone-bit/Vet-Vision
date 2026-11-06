from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken


class RevocableJWTAuthentication(JWTAuthentication):
    """simplejwt checks the blacklist for refresh tokens only, so an access token kept working for up to 15 minutes
    after logout. Logout blacklists the access token too (accounts/views.py), and this refuses it."""

    def get_validated_token(self, raw_token):
        token = super().get_validated_token(raw_token)
        if BlacklistedToken.objects.filter(token__jti=token.get("jti")).exists():
            raise InvalidToken("This session has been signed out.")
        return token
